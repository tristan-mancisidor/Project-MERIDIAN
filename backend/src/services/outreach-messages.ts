import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/environment';
import { prisma } from '../config/database';
import { logger } from '../middleware/logger';
import { buildEnrichedContext } from './agent-memory';
import { runComplianceGate, addComplianceDisclaimer } from './compliance';

// ============================================================
// Outreach Message Service
// Drafts personalized outreach messages using AI agent + memory context.
// All messages enter a PENDING_REVIEW state for advisor approval
// before delivery (compliance gate).
// ============================================================

const anthropic = env.anthropic.apiKey
  ? new Anthropic({ apiKey: env.anthropic.apiKey })
  : null;

const MODEL = 'claude-sonnet-4-5-20250929';

const OUTREACH_SYSTEM_PROMPT = `You are a professional outreach drafting assistant for Meridian Wealth Advisors, a fiduciary RIA firm.

Your role:
- Draft personalized client outreach messages on behalf of financial advisors
- Messages should be warm, professional, and actionable
- Reference specific client context to make messages feel personal, not generic
- Include a clear call to action (schedule a meeting, review portal, etc.)

Guidelines:
- Always act in the client's fiduciary best interest
- Never guarantee investment returns or outcomes
- Include appropriate disclaimers where needed
- Keep messages concise and easy to read
- Use a professional but approachable tone consistent with a luxury RIA brand
- Never include specific performance numbers or projections in outreach
- Reference the trigger reason naturally without being alarmist
- End with a soft call to action, never pressure

Format your response as JSON:
{
  "subject": "Email subject line",
  "body": "Full message body (use \\n for line breaks)"
}`;

interface DraftResult {
  messageId: string;
  status: 'drafted' | 'compliance_held' | 'error';
}

/**
 * Drafts outreach messages for all unprocessed triggers.
 * Each trigger gets a personalized AI-drafted message that enters compliance review.
 */
export async function draftMessagesForPendingTriggers(): Promise<DraftResult[]> {
  const startTime = Date.now();
  const results: DraftResult[] = [];

  const pendingTriggers = await prisma.outreachTrigger.findMany({
    where: { status: 'DETECTED' },
    include: {
      rule: true,
      client: {
        select: { id: true, firstName: true, lastName: true, serviceTier: true },
      },
    },
    orderBy: { detectedAt: 'asc' },
    take: 50, // Process in batches to avoid overwhelming the API
  });

  if (pendingTriggers.length === 0) {
    logger.debug('[OUTREACH] No pending triggers to draft messages for');
    return results;
  }

  logger.info(`[OUTREACH] Drafting messages for ${pendingTriggers.length} pending triggers`);

  for (const trigger of pendingTriggers) {
    try {
      // Mark trigger as processing
      await prisma.outreachTrigger.update({
        where: { id: trigger.id },
        data: { status: 'PROCESSING' },
      });

      const result = await draftSingleMessage(trigger);
      results.push(result);

      // Mark trigger as completed
      await prisma.outreachTrigger.update({
        where: { id: trigger.id },
        data: { status: 'MESSAGE_DRAFTED', processedAt: new Date() },
      });
    } catch (error: any) {
      logger.error('[OUTREACH] Failed to draft message:', { error: error.message, triggerId: trigger.id });

      await prisma.outreachTrigger.update({
        where: { id: trigger.id },
        data: { status: 'ERROR' },
      }).catch(() => {});

      results.push({ messageId: '', status: 'error' });
    }
  }

  const latencyMs = Date.now() - startTime;
  logger.info(`[OUTREACH] Message drafting complete: ${results.filter((r) => r.status === 'drafted').length} drafted, ${results.filter((r) => r.status === 'error').length} errors in ${latencyMs}ms`);

  return results;
}

/**
 * Drafts a single outreach message for a trigger.
 */
async function draftSingleMessage(trigger: any): Promise<DraftResult> {
  const agentType = trigger.rule.agentType || 'client_support';

  // Build enriched context using agent memory
  const clientContext = await buildEnrichedContext(trigger.clientId, agentType);

  // Build the prompt with trigger-specific context
  const prompt = buildTriggerPrompt(trigger);

  // Pre-flight compliance check
  const promptCompliance = await runComplianceGate(prompt, agentType, trigger.clientId);
  if (!promptCompliance.passed) {
    const message = await prisma.outreachMessage.create({
      data: {
        triggerId: trigger.id,
        clientId: trigger.clientId,
        subject: `[Compliance Hold] Outreach for ${trigger.triggerType}`,
        body: `This outreach was held for compliance review before drafting. Flags: ${promptCompliance.flags.map((f) => f.message).join('; ')}`,
        status: 'DRAFT',
        priority: trigger.rule.priority || 'MEDIUM',
        metadata: { complianceFlags: JSON.parse(JSON.stringify(promptCompliance.flags)) },
      },
    });
    return { messageId: message.id, status: 'compliance_held' };
  }

  // Draft via AI agent or use simulated response
  let subject: string;
  let body: string;
  let aiInteractionId: string | null = null;

  if (anthropic) {
    const aiStartTime = Date.now();
    const userMessage = clientContext
      ? `${prompt}\n\n--- Client Context ---\n${clientContext}`
      : prompt;

    const completion = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: OUTREACH_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    const responseText = completion.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    const tokensUsed = (completion.usage?.input_tokens || 0) + (completion.usage?.output_tokens || 0);
    const latencyMs = Date.now() - aiStartTime;

    logger.info(`[OUTREACH_COST] draftMessage: ${tokensUsed} tokens, ${latencyMs}ms, trigger=${trigger.id}`);

    // Log the AI interaction
    const interaction = await prisma.aIInteraction.create({
      data: {
        clientId: trigger.clientId,
        agentType,
        prompt,
        response: responseText,
        model: MODEL,
        tokensUsed,
        latencyMs,
        complianceFlag: false,
        triggerType: 'SCHEDULED',
        metadata: { outreachTriggerId: trigger.id, triggerType: trigger.triggerType },
      },
    });
    aiInteractionId = interaction.id;

    // Parse the AI response
    const parsed = parseAIResponse(responseText, trigger);
    subject = parsed.subject;
    body = parsed.body;

    // Post-response compliance check
    const responseCompliance = await runComplianceGate(body, agentType, trigger.clientId);
    if (!responseCompliance.passed) {
      body = addComplianceDisclaimer(body, agentType);
    }
  } else {
    // Simulated response when API key not configured
    const simulated = getSimulatedOutreach(trigger);
    subject = simulated.subject;
    body = simulated.body;
    logger.warn('[OUTREACH] Anthropic API key not configured — using simulated outreach');
  }

  // Create the outreach message in PENDING_REVIEW status
  const message = await prisma.outreachMessage.create({
    data: {
      triggerId: trigger.id,
      clientId: trigger.clientId,
      subject,
      body,
      status: 'PENDING_REVIEW',
      priority: trigger.rule.priority || 'MEDIUM',
      aiInteractionId,
      metadata: {
        triggerType: trigger.triggerType,
        triggerData: trigger.triggerData,
        agentType,
      },
    },
  });

  // Create audit log
  await prisma.auditLog.create({
    data: {
      action: 'OUTREACH_DRAFTED',
      entity: 'outreach_message',
      entityId: message.id,
      details: {
        clientId: trigger.clientId,
        triggerType: trigger.triggerType,
        triggerId: trigger.id,
        channel: 'EMAIL',
      },
    },
  }).catch((err) => logger.error('[OUTREACH] Failed to create audit log:', err));

  return { messageId: message.id, status: 'drafted' };
}

/**
 * Builds a trigger-specific prompt for the AI agent.
 */
function buildTriggerPrompt(trigger: any): string {
  const data = trigger.triggerData;
  const clientName = data.clientName || 'the client';

  switch (trigger.triggerType) {
    case 'PORTFOLIO_DRIFT':
      return `Draft a proactive outreach email for ${clientName} regarding portfolio drift detected in their investment accounts.

Drift details:
${data.drifts?.map((d: any) => `- ${d.assetClass}: currently ${d.current}% vs target ${d.target}% (${d.drift}% drift)`).join('\n') || 'Drift detected across asset classes'}

Total portfolio value: $${Number(data.totalPortfolioValue || 0).toLocaleString()}
Risk tolerance: ${data.riskTolerance || 'Not specified'}

The tone should be reassuring — this is a normal part of portfolio management. Suggest scheduling a review to discuss potential rebalancing.`;

    case 'GOAL_OFF_TRACK':
      return `Draft a supportive outreach email for ${clientName} about their financial goal "${data.goalName}" which appears to be falling behind schedule.

Goal details:
- Goal type: ${data.goalType}
- Target: $${Number(data.targetAmount || 0).toLocaleString()}
- Current: $${Number(data.currentAmount || 0).toLocaleString()} (${data.progress}% progress)
- Target date: ${data.targetDate ? new Date(data.targetDate).toLocaleDateString() : 'Not set'}

Be encouraging and suggest meeting to discuss strategies to get back on track. Do not be alarmist.`;

    case 'ACCOUNT_MILESTONE':
      return `Draft a congratulatory outreach email for ${clientName} who has reached a significant portfolio milestone.

Milestone: $${Number(data.milestone || 0).toLocaleString()}
Current total: $${Number(data.currentTotal || 0).toLocaleString()}

Celebrate this achievement and suggest meeting to review whether any strategy adjustments make sense at this new level.`;

    case 'REVIEW_DUE':
      return `Draft a friendly outreach email for ${clientName} to schedule their upcoming financial plan review.

Plan details:
- Plan: ${data.planName}
- Plan type: ${data.planType}
- Last reviewed: ${data.lastReviewedAt ? new Date(data.lastReviewedAt).toLocaleDateString() : 'Not recorded'}
- Review due by: ${data.nextReviewAt ? new Date(data.nextReviewAt).toLocaleDateString() : 'Soon'}

Keep it warm and suggest scheduling a meeting at their convenience.`;

    case 'LIFE_EVENT':
      return `Draft a thoughtful outreach email for ${clientName} regarding recent life changes that may impact their financial planning.

Detected events:
${data.events?.map((e: any) => `- ${e.content} (importance: ${e.importance})`).join('\n') || 'Life event detected'}

Be empathetic and offer to review how these changes might affect their financial plan. Schedule a planning session.`;

    case 'MARKET_EVENT':
      return `Draft a timely but calm outreach email for ${clientName} regarding recent market activity.

Event: ${data.eventDescription || 'Significant market movement'}
Impact: ${data.impact || 'Potential portfolio impact'}

Reassure the client that their portfolio is being monitored. Offer to discuss any concerns. Do NOT make predictions about market direction.`;

    default:
      return `Draft a professional outreach email for ${clientName} from their financial advisor at Meridian Wealth Advisors. The message should prompt a check-in conversation about their financial plan.`;
  }
}

/**
 * Parses the AI JSON response, falling back to raw text if parsing fails.
 */
function parseAIResponse(responseText: string, trigger: any): { subject: string; body: string } {
  try {
    const jsonStr = responseText.replace(/```json?\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(jsonStr);
    return {
      subject: parsed.subject || `Important update from your Meridian Wealth advisor`,
      body: parsed.body || responseText,
    };
  } catch {
    logger.warn('[OUTREACH] Failed to parse AI response as JSON — using raw text');
    return {
      subject: `Important update from your Meridian Wealth advisor`,
      body: responseText,
    };
  }
}

/**
 * Returns simulated outreach content when AI is not available.
 */
function getSimulatedOutreach(trigger: any): { subject: string; body: string } {
  const clientName = trigger.triggerData?.clientName || 'Valued Client';
  const firstName = clientName.split(' ')[0];

  const templates: Record<string, { subject: string; body: string }> = {
    PORTFOLIO_DRIFT: {
      subject: `Portfolio Review Opportunity – ${firstName}`,
      body: `Dear ${firstName},\n\nAs part of our ongoing portfolio monitoring, we've noticed that your current asset allocation has drifted from your target. This is a normal occurrence in actively managed portfolios and presents a good opportunity for us to review your strategy together.\n\nI'd love to schedule a brief meeting to discuss potential rebalancing options that align with your investment objectives and risk tolerance.\n\nPlease feel free to reach out at your convenience, or you can schedule a meeting directly through your client portal.\n\nWarm regards,\nYour Meridian Wealth Advisors Team\n\nDisclaimer: This communication is for informational purposes only and does not constitute investment advice. Past performance does not guarantee future results.`,
    },
    GOAL_OFF_TRACK: {
      subject: `Let's Check In on Your Financial Goals – ${firstName}`,
      body: `Dear ${firstName},\n\nI wanted to reach out regarding your financial goals. Our regular monitoring indicates that one of your goals may benefit from a strategy adjustment to help keep you on track toward your target.\n\nThis is a common occurrence, and there are several strategies we can explore together to help realign your progress. I'd welcome the opportunity to discuss some options with you.\n\nWould you be available for a brief call or meeting this week?\n\nBest regards,\nYour Meridian Wealth Advisors Team\n\nDisclaimer: This communication is for informational purposes only and does not constitute investment advice.`,
    },
    ACCOUNT_MILESTONE: {
      subject: `Congratulations on Your Portfolio Milestone! – ${firstName}`,
      body: `Dear ${firstName},\n\nI'm pleased to share that your portfolio has reached a significant milestone! This is a wonderful achievement and a testament to your disciplined approach to wealth building.\n\nAs your portfolio grows, it may be an ideal time to review your overall financial strategy to ensure everything remains aligned with your evolving goals. I'd love to schedule a meeting to discuss any adjustments that might benefit you at this stage.\n\nCongratulations again, and please don't hesitate to reach out.\n\nWarmly,\nYour Meridian Wealth Advisors Team`,
    },
    REVIEW_DUE: {
      subject: `Time for Your Financial Plan Review – ${firstName}`,
      body: `Dear ${firstName},\n\nIt's been a while since we last reviewed your financial plan together, and I'd like to schedule your periodic review. These regular check-ins help ensure your plan stays aligned with your current goals, risk tolerance, and life circumstances.\n\nDuring our review, we'll cover:\n- Portfolio performance and allocation\n- Progress toward your financial goals\n- Any changes in your personal or financial situation\n- Opportunities for optimization\n\nPlease let me know your availability, or feel free to book a time through your client portal.\n\nLooking forward to connecting,\nYour Meridian Wealth Advisors Team`,
    },
    LIFE_EVENT: {
      subject: `Checking In – Your Financial Plan and Recent Changes`,
      body: `Dear ${firstName},\n\nI wanted to reach out because major life changes can have a significant impact on your financial plan. Whether it's a positive milestone or a challenging transition, I'm here to help ensure your financial strategy adapts accordingly.\n\nI'd love to schedule some time to discuss how recent developments might affect your:\n- Investment strategy and risk tolerance\n- Insurance coverage needs\n- Estate planning documents\n- Tax planning approach\n\nPlease feel free to reach out whenever is convenient for you.\n\nWith care,\nYour Meridian Wealth Advisors Team`,
    },
    MARKET_EVENT: {
      subject: `Market Update and Your Portfolio – ${firstName}`,
      body: `Dear ${firstName},\n\nIn light of recent market activity, I wanted to proactively reach out to assure you that we are actively monitoring your portfolio and the broader market environment.\n\nWhile short-term market movements are a normal part of investing, I understand they can be concerning. Your portfolio has been constructed with your long-term goals and risk tolerance in mind, and we believe your current strategy remains sound.\n\nIf you have any questions or would like to discuss your portfolio in more detail, I'm here for you.\n\nSincerely,\nYour Meridian Wealth Advisors Team\n\nDisclaimer: This communication is for informational purposes only and does not constitute investment advice. Past performance does not guarantee future results.`,
    },
  };

  return templates[trigger.triggerType] || templates.REVIEW_DUE;
}
