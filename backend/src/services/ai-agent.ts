import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/environment';
import { prisma } from '../config/database';
import { logger } from '../middleware/logger';
import { runComplianceGate, addComplianceDisclaimer } from './compliance';
import { AIAgentRequest, AIAgentResponse, AgentType } from '../types';

const anthropic = env.anthropic.apiKey
  ? new Anthropic({ apiKey: env.anthropic.apiKey })
  : null;

const MODEL = 'claude-sonnet-4-5-20250929';

// System prompts for each agent type
const AGENT_SYSTEM_PROMPTS: Record<AgentType, string> = {
  financial_planning: `You are a financial planning AI assistant for Meridian Wealth Advisors, a fiduciary RIA firm.

Your role:
- Analyze client financial data and provide planning insights
- Help create comprehensive financial plans covering retirement, education, estate, and tax planning
- Calculate retirement readiness scores and goal progress
- Suggest asset allocation strategies aligned with client risk tolerance
- Identify gaps in insurance coverage and estate planning

Guidelines:
- Always act in the client's fiduciary best interest
- Never guarantee investment returns or outcomes
- Include appropriate disclaimers on projections
- Reference the client's specific risk tolerance and goals
- Consider tax implications of all recommendations
- Flag any concerns that require compliance review`,

  investment_management: `You are an investment management AI assistant for Meridian Wealth Advisors.

Your role:
- Analyze portfolio allocations and suggest rebalancing strategies
- Identify tax-loss harvesting opportunities
- Review investment performance against benchmarks
- Suggest investment changes aligned with client IPS
- Monitor concentration risk and sector exposure

Guidelines:
- All recommendations must align with the client's Investment Policy Statement
- Never recommend investments without suitability verification
- Always note potential risks alongside opportunities
- Consider the full portfolio context, not individual positions in isolation
- Flag any trades that would breach concentration limits (>10% single position)
- Include cost basis and tax impact analysis for any sell recommendations`,

  compliance: `You are a compliance review AI assistant for Meridian Wealth Advisors.

Your role:
- Review communications for regulatory compliance (SEC, FINRA)
- Check marketing materials against advertising rules
- Verify suitability of investment recommendations
- Monitor for potential conflicts of interest
- Ensure proper disclosures are included

Guidelines:
- Apply SEC Investment Advisers Act of 1940 standards
- Check against FINRA advertising and communications rules
- Verify fiduciary duty compliance
- Flag any guarantee language or misleading claims
- Ensure proper risk disclosures are present`,

  client_support: `You are a client support AI assistant for Meridian Wealth Advisors.

Your role:
- Help answer client questions about their accounts and services
- Explain financial concepts in clear, accessible language
- Guide clients through the portal and available features
- Assist with scheduling meetings and managing tasks
- Provide general education about financial planning topics

Guidelines:
- Be warm, professional, and empathetic
- Never provide specific investment advice (refer to their advisor)
- Protect client privacy and sensitive data
- Escalate complex or sensitive issues to human advisors
- Use the client's name and personalize responses based on their profile`,

  marketing: `You are a marketing content AI assistant for Meridian Wealth Advisors.

Your role:
- Create educational content about financial planning topics
- Draft blog posts, newsletters, and social media content
- Develop client-facing materials that explain services
- Help craft thought leadership pieces

Guidelines:
- All content must comply with SEC/FINRA advertising rules
- Never include specific performance claims or guarantees
- Include appropriate disclosures
- Maintain the Meridian brand voice: professional, trustworthy, approachable
- Focus on education over promotion
- Avoid superlatives like "best" or "#1"`,
};

export async function invokeAgent(request: AIAgentRequest, userId?: string): Promise<AIAgentResponse> {
  const startTime = Date.now();

  // Pre-flight compliance check on the prompt
  const promptCompliance = await runComplianceGate(request.prompt, request.agentType, request.clientId);

  if (!promptCompliance.passed) {
    const flagMessages = promptCompliance.flags
      .filter((f) => f.severity === 'high' || f.severity === 'critical')
      .map((f) => f.message)
      .join(' ');

    return {
      response: `This request has been flagged for compliance review. ${flagMessages} Please revise your request or contact the compliance team.`,
      agentType: request.agentType,
      model: MODEL,
      latencyMs: Date.now() - startTime,
      complianceFlag: true,
      metadata: { flags: promptCompliance.flags },
    };
  }

  // Build context from client data if available
  let clientContext = '';
  if (request.clientId) {
    clientContext = await buildClientContext(request.clientId);
  }

  const systemPrompt = AGENT_SYSTEM_PROMPTS[request.agentType];
  const userMessage = clientContext
    ? `${request.prompt}\n\n--- Client Context ---\n${clientContext}`
    : request.prompt;

  // If no API key, return a simulated response
  if (!anthropic) {
    logger.warn('Anthropic API key not configured - returning simulated response');
    const simulated = getSimulatedResponse(request.agentType, request.prompt);
    const latencyMs = Date.now() - startTime;

    await logInteraction(request, simulated, MODEL, 0, latencyMs, false, userId);

    return {
      response: addComplianceDisclaimer(simulated, request.agentType),
      agentType: request.agentType,
      model: MODEL,
      tokensUsed: 0,
      latencyMs,
      complianceFlag: false,
    };
  }

  try {
    const completion = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userMessage,
        },
        ...(request.context?.conversationHistory || []),
      ],
    });

    const responseText = completion.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

    const tokensUsed = (completion.usage?.input_tokens || 0) + (completion.usage?.output_tokens || 0);
    const latencyMs = Date.now() - startTime;

    // Post-response compliance check
    const responseCompliance = await runComplianceGate(responseText, request.agentType, request.clientId);

    const finalResponse = responseCompliance.passed
      ? addComplianceDisclaimer(responseText, request.agentType)
      : `[Response held for compliance review]\n\nThe AI-generated response has been flagged for compliance review before delivery. A compliance officer will review and approve or revise the content.`;

    await logInteraction(
      request,
      finalResponse,
      MODEL,
      tokensUsed,
      latencyMs,
      !responseCompliance.passed,
      userId
    );

    return {
      response: finalResponse,
      agentType: request.agentType,
      model: MODEL,
      tokensUsed,
      latencyMs,
      complianceFlag: !responseCompliance.passed,
      metadata: responseCompliance.flags.length > 0 ? { flags: responseCompliance.flags } : undefined,
    };
  } catch (error: any) {
    logger.error('AI agent error:', { error: error.message, agentType: request.agentType });

    return {
      response: 'I apologize, but I\'m unable to process this request at the moment. Please try again or contact your advisor directly.',
      agentType: request.agentType,
      model: MODEL,
      latencyMs: Date.now() - startTime,
      complianceFlag: false,
      metadata: { error: error.message },
    };
  }
}

async function buildClientContext(clientId: string): Promise<string> {
  try {
    const [client, profile, accounts, goals, activePlan] = await Promise.all([
      prisma.client.findUnique({
        where: { id: clientId },
        select: { firstName: true, lastName: true, serviceTier: true, custodian: true },
      }),
      prisma.clientProfile.findUnique({ where: { clientId } }),
      prisma.account.findMany({
        where: { clientId, isActive: true },
        include: { holdings: { take: 10, orderBy: { weight: 'desc' } } },
      }),
      prisma.goal.findMany({ where: { clientId } }),
      prisma.financialPlan.findFirst({
        where: { clientId, status: { in: ['ACTIVE', 'APPROVED'] } },
        orderBy: { updatedAt: 'desc' },
      }),
    ]);

    if (!client) return '';

    const totalPortfolio = accounts.reduce((sum, a) => sum + Number(a.currentValue), 0);

    const context = [
      `Client: ${client.firstName} ${client.lastName}`,
      `Service Tier: ${client.serviceTier}`,
      `Custodian: ${client.custodian}`,
      profile ? `Risk Tolerance: ${profile.riskTolerance}` : '',
      profile?.annualIncome ? `Annual Income: $${Number(profile.annualIncome).toLocaleString()}` : '',
      profile?.netWorth ? `Net Worth: $${Number(profile.netWorth).toLocaleString()}` : '',
      `Total Portfolio Value: $${totalPortfolio.toLocaleString()}`,
      `Accounts: ${accounts.map((a) => `${a.accountName} (${a.accountType}): $${Number(a.currentValue).toLocaleString()}`).join('; ')}`,
      goals.length > 0 ? `Goals: ${goals.map((g) => `${g.name} - ${Number(g.progress)}% complete`).join('; ')}` : '',
      activePlan ? `Active Plan: ${activePlan.name} (Retirement Score: ${activePlan.retirementScore || 'N/A'})` : '',
    ].filter(Boolean);

    return context.join('\n');
  } catch (error) {
    logger.error('Error building client context:', error);
    return '';
  }
}

async function logInteraction(
  request: AIAgentRequest,
  response: string,
  model: string,
  tokensUsed: number,
  latencyMs: number,
  complianceFlag: boolean,
  userId?: string
): Promise<void> {
  try {
    await prisma.aIInteraction.create({
      data: {
        userId,
        clientId: request.clientId,
        agentType: request.agentType,
        prompt: request.prompt,
        response,
        model,
        tokensUsed,
        latencyMs,
        complianceFlag,
        metadata: request.context,
      },
    });
  } catch (error) {
    logger.error('Error logging AI interaction:', error);
  }
}

function getSimulatedResponse(agentType: AgentType, prompt: string): string {
  const responses: Record<AgentType, string> = {
    financial_planning: `Based on the client's financial profile, here is my analysis:

1. **Retirement Readiness**: The current savings trajectory appears to be on track. With continued contributions and the current asset allocation, the projected retirement income replacement ratio is approximately 85%.

2. **Key Recommendations**:
   - Consider maximizing Roth IRA contributions for tax diversification
   - Review beneficiary designations annually
   - Explore umbrella insurance coverage given current net worth level

3. **Areas of Concern**:
   - Emergency fund may need to be increased to cover 6 months of expenses
   - Review estate planning documents if not updated in the last 3 years

This analysis is based on current data and standard planning assumptions. A detailed review with the advisor is recommended.`,

    investment_management: `Portfolio Analysis Summary:

1. **Current Allocation**: The portfolio is well-diversified across asset classes, with approximately 60% equities, 30% fixed income, and 10% alternatives.

2. **Rebalancing Opportunities**:
   - US Large Cap is slightly overweight (+2.3%) relative to target
   - International Developed is underweight (-1.5%)
   - Consider rebalancing during next quarterly review

3. **Tax-Loss Harvesting**: Identified potential tax-loss harvesting opportunities in the taxable account that could offset approximately $3,200 in gains.

4. **Performance**: Year-to-date return is tracking closely with the benchmark, with slight outperformance in fixed income allocation.`,

    compliance: `Compliance Review Complete:

- No prohibited language detected
- Proper disclosures are included
- Suitability alignment verified
- No conflicts of interest identified

Status: PASSED - Content may proceed for client delivery.`,

    client_support: `Thank you for your question! I'd be happy to help.

Your account information shows everything is up to date. Here are a few things you might find helpful:

- Your next portfolio review meeting is scheduled with your advisor
- All quarterly statements are available in the Documents section of your portal
- You can update your contact preferences in the Settings page

If you need to discuss anything in detail, I'd recommend scheduling a call with your advisor through the portal. Is there anything else I can help with?`,

    marketing: `Here's a draft for the educational content piece:

**Understanding Asset Allocation: A Guide for Long-Term Investors**

Asset allocation is the process of dividing your investment portfolio among different asset classes—such as stocks, bonds, and cash equivalents—to help manage risk while pursuing your financial goals.

Key Takeaways:
- Diversification across asset classes can help reduce portfolio volatility
- Your ideal allocation depends on your time horizon, risk tolerance, and financial goals
- Regular rebalancing helps maintain your target allocation over time
- There is no one-size-fits-all approach to asset allocation

At Meridian Wealth Advisors, we work with each client to develop a personalized investment strategy aligned with their unique financial situation and goals.`,
  };

  return responses[agentType] || 'AI agent response would appear here when the Anthropic API key is configured.';
}
