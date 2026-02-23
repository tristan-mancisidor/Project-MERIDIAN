import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/environment';
import { prisma } from '../config/database';
import { logger } from '../middleware/logger';
import { invokeAgent } from './ai-agent';
import {
  AgentType,
  OrchestratedRequest,
  OrchestratedResponse,
  ClassificationResult,
  AgentResult,
} from '../types';

const anthropic = env.anthropic.apiKey
  ? new Anthropic({ apiKey: env.anthropic.apiKey })
  : null;

// Use Haiku for classification, synthesis, and confidence — cheap and fast
const ORCHESTRATION_MODEL = 'claude-haiku-4-5-20251001';

const MAX_HANDOFF_DEPTH = 3;

const VALID_AGENTS: AgentType[] = [
  'financial_planning',
  'investment_management',
  'compliance',
  'client_support',
  'marketing',
  'tax_planning',
];

// ============================================
// MAIN ENTRY POINT
// ============================================

export async function orchestrate(request: OrchestratedRequest): Promise<OrchestratedResponse> {
  const startTime = Date.now();

  // Create session record
  const session = await prisma.agentSession.create({
    data: {
      clientId: request.clientId,
      userId: request.userId,
      originalQuery: request.prompt,
      classifiedIntents: {},
      status: 'ACTIVE',
      participatingAgents: [],
    },
  });

  try {
    // Step 1: Classify the query (or use forced agent type)
    let classification: ClassificationResult;
    if (request.forceAgentType) {
      classification = {
        agents: [request.forceAgentType],
        reasoning: `Forced agent type: ${request.forceAgentType}`,
        isMultiAgent: false,
      };
    } else {
      classification = await classifyQuery(request.prompt);
    }

    // Update session with classification
    await prisma.agentSession.update({
      where: { id: session.id },
      data: {
        classifiedIntents: classification as any,
        participatingAgents: classification.agents,
      },
    });

    // Step 2: Execute agent(s)
    let agentResults: AgentResult[];
    if (classification.agents.length === 1) {
      const result = await executeAgent(
        session.id,
        classification.agents[0],
        request.prompt,
        request.clientId,
        request.userId,
        0,
        null
      );
      agentResults = [result];
    } else {
      agentResults = await executeParallelAgents(
        session.id,
        classification.agents,
        request.prompt,
        request.clientId,
        request.userId
      );
    }

    // Step 3: Synthesize response (merge if multi-agent)
    let finalResponse: string;
    if (agentResults.length === 1) {
      finalResponse = agentResults[0].response;
    } else {
      finalResponse = await synthesizeResponse(request.prompt, agentResults);
    }

    // Step 4: Assess confidence
    const confidenceScore = await assessConfidence(request.prompt, finalResponse, agentResults);

    // Step 5: Compute escalation level
    const escalationLevel = computeEscalation(confidenceScore);

    // Step 6: Handle escalation
    if (escalationLevel === 'ESCALATED') {
      finalResponse = 'This query requires human advisor review. Your question has been forwarded to your advisory team, who will respond within one business day. If this is urgent, please contact your advisor directly.';

      // Create urgent task for advisor review
      await prisma.task.create({
        data: {
          clientId: request.clientId,
          title: 'AI Escalation: Low-confidence response requires advisor review',
          description: `The AI orchestration system flagged a query with low confidence (${confidenceScore.toFixed(2)}).\n\nOriginal query: "${request.prompt}"\n\nSession ID: ${session.id}\n\nPlease review the agent session and respond to the client directly.`,
          status: 'PENDING',
          priority: 'URGENT',
          category: 'review',
        },
      });
    }

    const totalTokens = agentResults.reduce((sum, r) => sum + r.tokensUsed, 0);
    const latencyMs = Date.now() - startTime;

    // Update session with final results
    await prisma.agentSession.update({
      where: { id: session.id },
      data: {
        status: escalationLevel === 'ESCALATED' ? 'ESCALATED' : 'COMPLETED',
        finalResponse,
        confidenceScore,
        escalationLevel,
        totalTokens,
        latencyMs,
      },
    });

    return {
      sessionId: session.id,
      response: finalResponse,
      classifiedIntents: classification,
      agentResults,
      confidenceScore,
      escalationLevel,
      totalTokens,
      latencyMs,
    };
  } catch (error: any) {
    const latencyMs = Date.now() - startTime;
    logger.error('[ORCHESTRATOR] Session failed:', { sessionId: session.id, error: error.message });

    await prisma.agentSession.update({
      where: { id: session.id },
      data: {
        status: 'FAILED',
        errorMessage: error.message,
        latencyMs,
      },
    });

    throw error;
  }
}

// ============================================
// CLASSIFICATION
// ============================================

async function classifyQuery(prompt: string): Promise<ClassificationResult> {
  // If no API key, use keyword-based fallback
  if (!anthropic) {
    return classifyByKeywords(prompt);
  }

  try {
    const completion = await anthropic.messages.create({
      model: ORCHESTRATION_MODEL,
      max_tokens: 512,
      system: `You are a query classifier for a wealth management platform. Given a client query, determine which specialist agent(s) should handle it.

Available agents:
- financial_planning: Retirement planning, financial plans, goal tracking, insurance review, estate planning
- investment_management: Portfolio analysis, rebalancing, performance review, asset allocation
- tax_planning: Tax-loss harvesting, Roth conversions, capital gains analysis, asset location optimization
- compliance: Regulatory review, suitability checks, disclosure verification
- client_support: Account questions, portal help, scheduling, general inquiries
- marketing: Content creation, educational materials (staff-only)

Return a JSON object with:
- "agents": array of 1-3 agent types needed (most specific first)
- "reasoning": one sentence explaining the classification
- "isMultiAgent": boolean, true if the query genuinely requires multiple agents

Only route to multiple agents when the query clearly spans multiple domains. Default to a single agent.`,
      messages: [{ role: 'user', content: prompt }],
    });

    const responseText = completion.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    const jsonStr = responseText.replace(/```json?\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(jsonStr);

    // Validate agent types
    const validAgents = (parsed.agents as string[]).filter((a) =>
      VALID_AGENTS.includes(a as AgentType)
    ) as AgentType[];

    if (validAgents.length === 0) {
      return classifyByKeywords(prompt);
    }

    return {
      agents: validAgents.slice(0, 3), // Max 3 agents
      reasoning: parsed.reasoning || 'Classified by AI',
      isMultiAgent: validAgents.length > 1,
    };
  } catch (error: any) {
    logger.warn('[ORCHESTRATOR] Classification failed, falling back to keywords:', { error: error.message });
    return classifyByKeywords(prompt);
  }
}

function classifyByKeywords(prompt: string): ClassificationResult {
  const lower = prompt.toLowerCase();
  const agents: AgentType[] = [];

  // Tax planning keywords
  if (/\b(tax|roth|conversion|capital gains|harvesting|1099|w-2|deduction|ira contribution|rmd|wash sale)\b/.test(lower)) {
    agents.push('tax_planning');
  }

  // Investment management keywords
  if (/\b(portfolio|rebalanc|allocation|performance|holdings|stocks?|bonds?|etf|fund|invest|dividend|benchmark)\b/.test(lower)) {
    agents.push('investment_management');
  }

  // Financial planning keywords
  if (/\b(retire|financial plan|goal|estate|insurance|budget|savings rate|net worth|education fund|529)\b/.test(lower)) {
    agents.push('financial_planning');
  }

  // Compliance keywords
  if (/\b(compliance|regulatory|suitability|disclosure|sec |finra|audit)\b/.test(lower)) {
    agents.push('compliance');
  }

  // Client support keywords
  if (/\b(account|portal|password|schedule|meeting|document|statement|help|how do i)\b/.test(lower)) {
    agents.push('client_support');
  }

  // Default to client_support if no matches
  if (agents.length === 0) {
    agents.push('client_support');
  }

  return {
    agents: agents.slice(0, 3),
    reasoning: `Keyword-based classification (no API key): matched ${agents.join(', ')}`,
    isMultiAgent: agents.length > 1,
  };
}

// ============================================
// AGENT EXECUTION
// ============================================

async function executeAgent(
  sessionId: string,
  agentType: AgentType,
  prompt: string,
  clientId?: string,
  userId?: string,
  depth: number = 0,
  fromAgent: string | null = null
): Promise<AgentResult> {
  if (depth > MAX_HANDOFF_DEPTH) {
    throw new Error(`Max handoff depth (${MAX_HANDOFF_DEPTH}) exceeded`);
  }

  // Create handoff record
  const handoff = await prisma.agentHandoff.create({
    data: {
      sessionId,
      fromAgent,
      toAgent: agentType,
      handoffDepth: depth,
      status: 'IN_PROGRESS',
      prompt,
      inputContext: fromAgent ? `Handoff from ${fromAgent} at depth ${depth}` : null,
    },
  });

  try {
    // Delegate to existing invokeAgent — preserves all compliance gates, memory, audit
    const result = await invokeAgent(
      { agentType, prompt, clientId },
      userId,
      fromAgent ? 'AGENT_CHAIN' : 'USER_CHAT'
    );

    // Parse confidence from response metadata or default
    const confidenceScore = result.complianceFlag ? 0.3 : 0.8;

    // Update handoff with results
    await prisma.agentHandoff.update({
      where: { id: handoff.id },
      data: {
        status: 'COMPLETED',
        response: result.response,
        confidenceScore,
        tokensUsed: result.tokensUsed || 0,
        latencyMs: result.latencyMs,
      },
    });

    return {
      agentType,
      response: result.response,
      confidenceScore,
      tokensUsed: result.tokensUsed || 0,
      latencyMs: result.latencyMs,
      handoffId: handoff.id,
      complianceFlag: result.complianceFlag,
    };
  } catch (error: any) {
    await prisma.agentHandoff.update({
      where: { id: handoff.id },
      data: { status: 'FAILED' },
    });
    throw error;
  }
}

async function executeParallelAgents(
  sessionId: string,
  agents: AgentType[],
  prompt: string,
  clientId?: string,
  userId?: string
): Promise<AgentResult[]> {
  const promises = agents.map((agentType) =>
    executeAgent(sessionId, agentType, prompt, clientId, userId, 0, null)
  );

  const settled = await Promise.allSettled(promises);
  const results: AgentResult[] = [];

  for (const outcome of settled) {
    if (outcome.status === 'fulfilled') {
      results.push(outcome.value);
    } else {
      logger.error('[ORCHESTRATOR] Parallel agent failed:', { error: outcome.reason?.message });
    }
  }

  // At least one agent must succeed
  if (results.length === 0) {
    throw new Error('All parallel agents failed');
  }

  return results;
}

// ============================================
// SYNTHESIS
// ============================================

async function synthesizeResponse(originalQuery: string, agentResults: AgentResult[]): Promise<string> {
  const agentOutputs = agentResults
    .map((r) => `[${r.agentType.toUpperCase()}]:\n${r.response}`)
    .join('\n\n---\n\n');

  if (!anthropic) {
    // No API key — simple concatenation with headers
    return agentResults
      .map((r) => `**${formatAgentName(r.agentType)}:**\n\n${r.response}`)
      .join('\n\n---\n\n');
  }

  try {
    const completion = await anthropic.messages.create({
      model: ORCHESTRATION_MODEL,
      max_tokens: 2048,
      system: `You are a response synthesizer for a wealth management platform. You receive outputs from multiple specialist agents and must merge them into a single, cohesive response for the client.

Rules:
- Combine insights from all agents into a natural, flowing response
- Remove redundant information
- Maintain all compliance disclaimers from individual responses
- Organize the response logically (overview → details → action items → disclaimers)
- Do not add information beyond what the agents provided
- Keep the professional, fiduciary tone`,
      messages: [
        {
          role: 'user',
          content: `Original client query: "${originalQuery}"\n\nAgent outputs:\n\n${agentOutputs}`,
        },
      ],
    });

    return completion.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');
  } catch (error: any) {
    logger.warn('[ORCHESTRATOR] Synthesis failed, using concatenation fallback:', { error: error.message });
    return agentResults
      .map((r) => `**${formatAgentName(r.agentType)}:**\n\n${r.response}`)
      .join('\n\n---\n\n');
  }
}

// ============================================
// CONFIDENCE ASSESSMENT
// ============================================

async function assessConfidence(
  originalQuery: string,
  finalResponse: string,
  agentResults: AgentResult[]
): Promise<number> {
  // If any agent flagged compliance, lower confidence
  const hasComplianceFlag = agentResults.some((r) => r.complianceFlag);
  if (hasComplianceFlag) return 0.3;

  if (!anthropic) {
    // No API key — use heuristic: average of agent confidence scores
    const avg = agentResults.reduce((sum, r) => sum + r.confidenceScore, 0) / agentResults.length;
    return Math.round(avg * 100) / 100;
  }

  try {
    const completion = await anthropic.messages.create({
      model: ORCHESTRATION_MODEL,
      max_tokens: 256,
      system: `You are a confidence assessor for a financial advisory AI. Score the response on a 0.0 to 1.0 scale.

Consider:
- Does the response directly address the query?
- Is the information accurate and specific (not generic filler)?
- Are there appropriate caveats and disclaimers?
- Would a human advisor approve this response?

Return ONLY a JSON object: {"score": 0.85, "reasoning": "brief explanation"}`,
      messages: [
        {
          role: 'user',
          content: `Query: "${originalQuery}"\n\nResponse: "${finalResponse.substring(0, 2000)}"`,
        },
      ],
    });

    const responseText = completion.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    const jsonStr = responseText.replace(/```json?\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(jsonStr);
    const score = Math.max(0, Math.min(1, parsed.score));
    return Math.round(score * 100) / 100;
  } catch (error: any) {
    logger.warn('[ORCHESTRATOR] Confidence assessment failed, using heuristic:', { error: error.message });
    const avg = agentResults.reduce((sum, r) => sum + r.confidenceScore, 0) / agentResults.length;
    return Math.round(avg * 100) / 100;
  }
}

// ============================================
// ESCALATION
// ============================================

export function computeEscalation(confidenceScore: number): 'NONE' | 'FLAGGED' | 'ESCALATED' {
  if (confidenceScore < 0.4) return 'ESCALATED';
  if (confidenceScore < 0.7) return 'FLAGGED';
  return 'NONE';
}

// ============================================
// HELPERS
// ============================================

function formatAgentName(agentType: AgentType): string {
  const names: Record<AgentType, string> = {
    financial_planning: 'Financial Planning',
    investment_management: 'Investment Management',
    tax_planning: 'Tax Planning',
    compliance: 'Compliance',
    client_support: 'Client Support',
    marketing: 'Marketing',
  };
  return names[agentType] || agentType;
}
