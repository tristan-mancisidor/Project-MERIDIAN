import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/environment';
import { prisma } from '../config/database';
import { logger } from '../middleware/logger';

const anthropic = env.anthropic.apiKey
  ? new Anthropic({ apiKey: env.anthropic.apiKey })
  : null;

// Use a fast, cheap model for memory extraction
const MEMORY_MODEL = 'claude-haiku-4-5-20251001';

interface ExtractedMemory {
  memoryType: 'CONVERSATION_SUMMARY' | 'PREFERENCE' | 'LIFE_EVENT' | 'RECOMMENDATION' | 'DECISION' | 'RELATIONSHIP_NOTE';
  content: string;
  importance: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  structuredData?: Record<string, any>;
}

const MEMORY_EXTRACTION_PROMPT = `You are a memory extraction system for a financial advisor AI. Analyze the following interaction between a client and an AI financial advisor. Extract durable memories that would be important for future interactions.

For each memory, classify it as one of:
- PREFERENCE: Client's stated preferences, likes, dislikes, constraints (e.g., "hates bonds", "prefers index funds", "wants ESG investments")
- LIFE_EVENT: Major life changes or upcoming events (e.g., "getting married", "expecting a child", "planning to retire in 2 years")
- RECOMMENDATION: Specific advice or recommendations given by the advisor
- DECISION: Decisions the client made or declined (e.g., "decided against Roth conversion", "agreed to increase 401k contributions")
- RELATIONSHIP_NOTE: Interpersonal observations (e.g., "client seemed anxious about market volatility", "client is very detail-oriented")
- CONVERSATION_SUMMARY: Brief summary of the overall conversation topic and outcome

Rate importance as:
- CRITICAL: Life events, major financial decisions, compliance-relevant statements
- HIGH: Stated preferences that affect investment strategy, important goals mentioned
- MEDIUM: General preferences, conversation context
- LOW: Minor details, small talk

Return a JSON array of memories. If no durable memories are worth extracting, return an empty array [].

Format:
[
  {
    "memoryType": "PREFERENCE",
    "content": "Client expressed strong preference for low-cost index funds over actively managed funds",
    "importance": "HIGH",
    "structuredData": {"key": "investment_preference", "value": "index_funds", "confidence": 0.95}
  }
]

Only extract genuinely useful memories. Do not extract trivial greetings or generic responses. Be concise — each memory should be one clear sentence.`;

/**
 * Extracts durable memories from an AI interaction using a lightweight LLM call.
 * Called asynchronously after each agent interaction (fire-and-forget).
 */
export async function extractMemories(interactionId: string): Promise<void> {
  try {
    const interaction = await prisma.aIInteraction.findUnique({
      where: { id: interactionId },
    });

    if (!interaction || !interaction.clientId) {
      return;
    }

    if (!anthropic) {
      logger.warn('[MEMORY] Anthropic API key not configured — skipping memory extraction');
      return;
    }

    const conversationText = `CLIENT PROMPT: ${interaction.prompt}\n\nADVISOR RESPONSE (${interaction.agentType}): ${interaction.response}`;

    const startTime = Date.now();
    const completion = await anthropic.messages.create({
      model: MEMORY_MODEL,
      max_tokens: 1024,
      system: MEMORY_EXTRACTION_PROMPT,
      messages: [{ role: 'user', content: conversationText }],
    });

    const responseText = completion.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    const tokensUsed = (completion.usage?.input_tokens || 0) + (completion.usage?.output_tokens || 0);
    const latencyMs = Date.now() - startTime;

    logger.info(`[MEMORY_COST] extractMemories: ${tokensUsed} tokens, ${latencyMs}ms, interaction=${interactionId}`);

    // Parse the JSON response
    let memories: ExtractedMemory[];
    try {
      // Handle potential markdown code blocks in response
      const jsonStr = responseText.replace(/```json?\n?/g, '').replace(/```\n?/g, '').trim();
      memories = JSON.parse(jsonStr);
    } catch (parseError) {
      logger.warn('[MEMORY] Failed to parse memory extraction response', { responseText, parseError });
      return;
    }

    if (!Array.isArray(memories) || memories.length === 0) {
      logger.debug(`[MEMORY] No memories extracted from interaction ${interactionId}`);
      // Still mark as extracted even if no memories found
      await prisma.aIInteraction.update({
        where: { id: interactionId },
        data: { memoryExtracted: true },
      });
      return;
    }

    // Store each extracted memory
    for (const memory of memories) {
      await prisma.agentMemory.create({
        data: {
          clientId: interaction.clientId,
          agentType: interaction.agentType,
          memoryType: memory.memoryType,
          content: memory.content,
          importance: memory.importance,
          structuredData: memory.structuredData || undefined,
          sourceInteractionId: interactionId,
        },
      });
    }

    // Mark the interaction as having had memories extracted
    await prisma.aIInteraction.update({
      where: { id: interactionId },
      data: { memoryExtracted: true },
    });

    logger.info(`[MEMORY] Extracted ${memories.length} memories from interaction ${interactionId}`);
  } catch (error: any) {
    // Never block the main interaction — log and continue
    logger.error('[MEMORY] Error extracting memories:', { error: error.message, interactionId });
  }
}

/**
 * Retrieves memories for a client, ranked by importance then recency.
 */
export async function getClientMemories(
  clientId: string,
  agentType?: string,
  limit: number = 50,
): Promise<any[]> {
  const where: any = {
    clientId,
    OR: [
      { expiresAt: null },
      { expiresAt: { gt: new Date() } },
    ],
  };

  if (agentType) {
    where.agentType = agentType;
  }

  return prisma.agentMemory.findMany({
    where,
    orderBy: [
      { importance: 'desc' },
      { createdAt: 'desc' },
    ],
    take: limit,
  });
}

/**
 * Builds enriched context for an agent call, combining structured DB data with relevant memories.
 * Replaces the old buildClientContext() function.
 * Respects an ~8,000 token budget (estimated at ~4 chars per token).
 */
export async function buildEnrichedContext(clientId: string, agentType: string): Promise<string> {
  const TOKEN_BUDGET = 8000;
  const CHARS_PER_TOKEN = 4; // rough estimate
  const CHAR_BUDGET = TOKEN_BUDGET * CHARS_PER_TOKEN;

  try {
    // Fetch structured data (same as original buildClientContext)
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

    // Build structured context (always included)
    const structuredLines = [
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

    const structuredContext = structuredLines.join('\n');
    let usedChars = structuredContext.length;

    // Fetch memories, prioritized by importance
    const memories = await getClientMemories(clientId, undefined, 100);

    if (memories.length === 0) {
      return structuredContext;
    }

    // Build memory sections by importance tier
    const memoryLines: string[] = [];
    const importanceOrder = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

    for (const importance of importanceOrder) {
      const tierMemories = memories.filter((m) => m.importance === importance);
      if (tierMemories.length === 0) continue;

      for (const memory of tierMemories) {
        const line = `[${memory.memoryType}] ${memory.content}`;
        if (usedChars + line.length + 2 > CHAR_BUDGET) {
          // Budget exceeded — stop adding memories
          break;
        }
        memoryLines.push(line);
        usedChars += line.length + 1; // +1 for newline
      }

      // If we've exceeded budget, don't process lower tiers
      if (usedChars >= CHAR_BUDGET) break;
    }

    if (memoryLines.length === 0) {
      return structuredContext;
    }

    return `${structuredContext}\n\n--- Agent Memory (${memoryLines.length} items) ---\n${memoryLines.join('\n')}`;
  } catch (error) {
    logger.error('[MEMORY] Error building enriched context:', error);
    // Fall back to empty string on error — same as original behavior
    return '';
  }
}

/**
 * Placeholder for memory pruning. Will be fully implemented in a later phase.
 */
export async function pruneMemories(clientId: string): Promise<void> {
  logger.info(`[MEMORY] pruneMemories called for client ${clientId} — placeholder, no action taken`);
}
