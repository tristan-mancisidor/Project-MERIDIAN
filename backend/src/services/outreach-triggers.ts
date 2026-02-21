import { prisma } from '../config/database';
import { logger } from '../middleware/logger';

// ============================================================
// Outreach Trigger Detection Service
// Scans client portfolios and profiles for actionable events
// that warrant proactive advisor outreach.
// ============================================================

interface DetectedTrigger {
  clientId: string;
  ruleId: string;
  triggerType: string;
  triggerData: Record<string, any>;
}

// ============================================================
// 1. PORTFOLIO DRIFT DETECTION
// Compares current asset class weights against target allocation.
// ============================================================

export async function detectPortfolioDrift(driftThresholdPct: number = 5): Promise<DetectedTrigger[]> {
  const triggers: DetectedTrigger[] = [];

  const rule = await prisma.outreachRule.findFirst({
    where: { triggerType: 'PORTFOLIO_DRIFT', isActive: true },
  });

  if (!rule) {
    logger.debug('[OUTREACH] No active PORTFOLIO_DRIFT rule found — skipping');
    return triggers;
  }

  const threshold = (rule.config as any)?.driftThresholdPct ?? driftThresholdPct;

  // Get all active clients with accounts
  const clients = await prisma.client.findMany({
    where: { status: 'ACTIVE', isActive: true },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      profile: { select: { riskTolerance: true } },
      accounts: {
        where: { isActive: true },
        include: { holdings: true },
      },
    },
  });

  for (const client of clients) {
    if (client.accounts.length === 0) continue;

    // Check cooldown — skip if trigger fired recently for this client+rule
    const recentTrigger = await prisma.outreachTrigger.findFirst({
      where: {
        clientId: client.id,
        ruleId: rule.id,
        detectedAt: { gte: new Date(Date.now() - rule.cooldownDays * 24 * 60 * 60 * 1000) },
      },
    });
    if (recentTrigger) continue;

    // Calculate current allocation by asset class
    const allHoldings = client.accounts.flatMap((a) => a.holdings);
    const totalValue = allHoldings.reduce((sum, h) => sum + Number(h.marketValue), 0);
    if (totalValue === 0) continue;

    const currentAllocation: Record<string, number> = {};
    for (const h of allHoldings) {
      const assetClass = h.assetClass || 'other';
      currentAllocation[assetClass] = (currentAllocation[assetClass] || 0) + Number(h.marketValue);
    }

    // Convert to percentages
    const currentPct: Record<string, number> = {};
    for (const [cls, val] of Object.entries(currentAllocation)) {
      currentPct[cls] = (val / totalValue) * 100;
    }

    // Target allocation based on risk tolerance
    const targetAllocation = getTargetAllocation(client.profile?.riskTolerance || 'MODERATE');

    // Check drift for each asset class
    const drifts: Array<{ assetClass: string; current: number; target: number; drift: number }> = [];
    for (const [cls, target] of Object.entries(targetAllocation)) {
      const current = currentPct[cls] || 0;
      const drift = Math.abs(current - target);
      if (drift >= threshold) {
        drifts.push({ assetClass: cls, current: Math.round(current * 100) / 100, target, drift: Math.round(drift * 100) / 100 });
      }
    }

    if (drifts.length > 0) {
      triggers.push({
        clientId: client.id,
        ruleId: rule.id,
        triggerType: 'PORTFOLIO_DRIFT',
        triggerData: {
          totalPortfolioValue: totalValue,
          drifts,
          riskTolerance: client.profile?.riskTolerance,
          clientName: `${client.firstName} ${client.lastName}`,
        },
      });
    }
  }

  logger.info(`[OUTREACH] Portfolio drift scan complete: ${triggers.length} triggers detected`);
  return triggers;
}

// ============================================================
// 2. GOAL OFF-TRACK DETECTION
// Flags clients whose goals have fallen behind schedule.
// ============================================================

export async function detectGoalsOffTrack(): Promise<DetectedTrigger[]> {
  const triggers: DetectedTrigger[] = [];

  const rule = await prisma.outreachRule.findFirst({
    where: { triggerType: 'GOAL_OFF_TRACK', isActive: true },
  });

  if (!rule) {
    logger.debug('[OUTREACH] No active GOAL_OFF_TRACK rule found — skipping');
    return triggers;
  }

  const goals = await prisma.goal.findMany({
    where: { isOnTrack: false },
    include: {
      client: { select: { id: true, firstName: true, lastName: true, status: true, isActive: true } },
    },
  });

  for (const goal of goals) {
    if (goal.client.status !== 'ACTIVE' || !goal.client.isActive) continue;

    // Check cooldown
    const recentTrigger = await prisma.outreachTrigger.findFirst({
      where: {
        clientId: goal.client.id,
        ruleId: rule.id,
        triggerData: { path: ['goalId'], equals: goal.id },
        detectedAt: { gte: new Date(Date.now() - rule.cooldownDays * 24 * 60 * 60 * 1000) },
      },
    });
    if (recentTrigger) continue;

    triggers.push({
      clientId: goal.client.id,
      ruleId: rule.id,
      triggerType: 'GOAL_OFF_TRACK',
      triggerData: {
        goalId: goal.id,
        goalName: goal.name,
        goalType: goal.type,
        targetAmount: Number(goal.targetAmount),
        currentAmount: Number(goal.currentAmount),
        progress: Number(goal.progress),
        targetDate: goal.targetDate.toISOString(),
        clientName: `${goal.client.firstName} ${goal.client.lastName}`,
      },
    });
  }

  logger.info(`[OUTREACH] Goal off-track scan complete: ${triggers.length} triggers detected`);
  return triggers;
}

// ============================================================
// 3. ACCOUNT MILESTONE DETECTION
// Detects when accounts cross significant value thresholds.
// ============================================================

export async function detectAccountMilestones(): Promise<DetectedTrigger[]> {
  const triggers: DetectedTrigger[] = [];

  const rule = await prisma.outreachRule.findFirst({
    where: { triggerType: 'ACCOUNT_MILESTONE', isActive: true },
  });

  if (!rule) {
    logger.debug('[OUTREACH] No active ACCOUNT_MILESTONE rule found — skipping');
    return triggers;
  }

  const milestoneThresholds = (rule.config as any)?.thresholds ?? [100000, 250000, 500000, 1000000, 2500000, 5000000];

  const clients = await prisma.client.findMany({
    where: { status: 'ACTIVE', isActive: true },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      accounts: {
        where: { isActive: true },
        select: { currentValue: true },
      },
    },
  });

  for (const client of clients) {
    const totalValue = client.accounts.reduce((sum, a) => sum + Number(a.currentValue), 0);

    // Find the highest milestone crossed
    const crossedMilestones = milestoneThresholds.filter((t: number) => totalValue >= t);
    if (crossedMilestones.length === 0) continue;

    const highestMilestone = Math.max(...crossedMilestones);

    // Check cooldown — only trigger once per milestone
    const recentTrigger = await prisma.outreachTrigger.findFirst({
      where: {
        clientId: client.id,
        ruleId: rule.id,
        triggerData: { path: ['milestone'], equals: highestMilestone },
      },
    });
    if (recentTrigger) continue;

    triggers.push({
      clientId: client.id,
      ruleId: rule.id,
      triggerType: 'ACCOUNT_MILESTONE',
      triggerData: {
        milestone: highestMilestone,
        currentTotal: totalValue,
        clientName: `${client.firstName} ${client.lastName}`,
      },
    });
  }

  logger.info(`[OUTREACH] Account milestone scan complete: ${triggers.length} triggers detected`);
  return triggers;
}

// ============================================================
// 4. REVIEW DUE DETECTION
// Flags clients whose financial plans are due for review.
// ============================================================

export async function detectReviewsDue(): Promise<DetectedTrigger[]> {
  const triggers: DetectedTrigger[] = [];

  const rule = await prisma.outreachRule.findFirst({
    where: { triggerType: 'REVIEW_DUE', isActive: true },
  });

  if (!rule) {
    logger.debug('[OUTREACH] No active REVIEW_DUE rule found — skipping');
    return triggers;
  }

  const plans = await prisma.financialPlan.findMany({
    where: {
      status: { in: ['ACTIVE', 'APPROVED'] },
      nextReviewAt: { lte: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) }, // Due within 14 days
    },
    include: {
      client: { select: { id: true, firstName: true, lastName: true, status: true, isActive: true } },
    },
  });

  for (const plan of plans) {
    if (plan.client.status !== 'ACTIVE' || !plan.client.isActive) continue;

    // Check cooldown
    const recentTrigger = await prisma.outreachTrigger.findFirst({
      where: {
        clientId: plan.client.id,
        ruleId: rule.id,
        triggerData: { path: ['planId'], equals: plan.id },
        detectedAt: { gte: new Date(Date.now() - rule.cooldownDays * 24 * 60 * 60 * 1000) },
      },
    });
    if (recentTrigger) continue;

    triggers.push({
      clientId: plan.client.id,
      ruleId: rule.id,
      triggerType: 'REVIEW_DUE',
      triggerData: {
        planId: plan.id,
        planName: plan.name,
        planType: plan.planType,
        nextReviewAt: plan.nextReviewAt?.toISOString(),
        lastReviewedAt: plan.lastReviewedAt?.toISOString(),
        clientName: `${plan.client.firstName} ${plan.client.lastName}`,
      },
    });
  }

  logger.info(`[OUTREACH] Review due scan complete: ${triggers.length} triggers detected`);
  return triggers;
}

// ============================================================
// 5. LIFE EVENT DETECTION (from Agent Memory)
// Scans agent memories for life events that haven't been addressed.
// ============================================================

export async function detectLifeEvents(): Promise<DetectedTrigger[]> {
  const triggers: DetectedTrigger[] = [];

  const rule = await prisma.outreachRule.findFirst({
    where: { triggerType: 'LIFE_EVENT', isActive: true },
  });

  if (!rule) {
    logger.debug('[OUTREACH] No active LIFE_EVENT rule found — skipping');
    return triggers;
  }

  const lookbackDays = (rule.config as any)?.lookbackDays ?? 30;

  // Find recent LIFE_EVENT memories with HIGH or CRITICAL importance
  const memories = await prisma.agentMemory.findMany({
    where: {
      memoryType: 'LIFE_EVENT',
      importance: { in: ['HIGH', 'CRITICAL'] },
      createdAt: { gte: new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000) },
    },
    include: {
      client: { select: { id: true, firstName: true, lastName: true, status: true, isActive: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Group by client to avoid duplicate triggers
  const clientMemories = new Map<string, typeof memories>();
  for (const memory of memories) {
    if (memory.client.status !== 'ACTIVE' || !memory.client.isActive) continue;

    const existing = clientMemories.get(memory.clientId) || [];
    existing.push(memory);
    clientMemories.set(memory.clientId, existing);
  }

  for (const [clientId, mems] of clientMemories) {
    // Check cooldown
    const recentTrigger = await prisma.outreachTrigger.findFirst({
      where: {
        clientId,
        ruleId: rule.id,
        detectedAt: { gte: new Date(Date.now() - rule.cooldownDays * 24 * 60 * 60 * 1000) },
      },
    });
    if (recentTrigger) continue;

    const firstMem = mems[0];
    triggers.push({
      clientId,
      ruleId: rule.id,
      triggerType: 'LIFE_EVENT',
      triggerData: {
        events: mems.map((m) => ({
          content: m.content,
          importance: m.importance,
          detectedAt: m.createdAt.toISOString(),
        })),
        clientName: `${firstMem.client.firstName} ${firstMem.client.lastName}`,
      },
    });
  }

  logger.info(`[OUTREACH] Life event scan complete: ${triggers.length} triggers detected`);
  return triggers;
}

// ============================================================
// 6. MARKET EVENT DETECTION (Stub — requires external data feed)
// ============================================================

export async function detectMarketEvents(): Promise<DetectedTrigger[]> {
  // TODO: Integrate with market data API (e.g., Alpha Vantage, Bloomberg, Polygon.io)
  // When connected, this should:
  // 1. Check for significant index movements (>2% daily, >5% weekly)
  // 2. Detect sector-specific events relevant to client holdings
  // 3. Monitor interest rate changes
  // 4. Track economic indicator releases (CPI, employment, GDP)
  logger.info('[OUTREACH] Market event detection is a stub — no external data feed configured');
  return [];
}

// ============================================================
// ORCHESTRATOR: Run all trigger detections
// ============================================================

export async function runAllTriggerDetections(): Promise<DetectedTrigger[]> {
  const startTime = Date.now();
  logger.info('[OUTREACH] Starting trigger detection scan...');

  const results = await Promise.allSettled([
    detectPortfolioDrift(),
    detectGoalsOffTrack(),
    detectAccountMilestones(),
    detectReviewsDue(),
    detectLifeEvents(),
    detectMarketEvents(),
  ]);

  const allTriggers: DetectedTrigger[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      allTriggers.push(...result.value);
    } else {
      logger.error('[OUTREACH] Trigger detection failed:', { error: result.reason?.message });
    }
  }

  // Persist detected triggers
  for (const trigger of allTriggers) {
    try {
      await prisma.outreachTrigger.create({
        data: {
          clientId: trigger.clientId,
          ruleId: trigger.ruleId,
          triggerType: trigger.triggerType as any,
          triggerData: trigger.triggerData,
          status: 'DETECTED',
        },
      });
    } catch (error: any) {
      logger.error('[OUTREACH] Failed to persist trigger:', { error: error.message, trigger });
    }
  }

  const latencyMs = Date.now() - startTime;
  logger.info(`[OUTREACH] Trigger detection complete: ${allTriggers.length} triggers in ${latencyMs}ms`);

  // Audit log entry for the scan
  await prisma.auditLog.create({
    data: {
      action: 'OUTREACH_SCAN',
      entity: 'outreach_trigger',
      details: {
        triggersDetected: allTriggers.length,
        latencyMs,
        breakdown: {
          portfolioDrift: allTriggers.filter((t) => t.triggerType === 'PORTFOLIO_DRIFT').length,
          goalOffTrack: allTriggers.filter((t) => t.triggerType === 'GOAL_OFF_TRACK').length,
          accountMilestone: allTriggers.filter((t) => t.triggerType === 'ACCOUNT_MILESTONE').length,
          reviewDue: allTriggers.filter((t) => t.triggerType === 'REVIEW_DUE').length,
          lifeEvent: allTriggers.filter((t) => t.triggerType === 'LIFE_EVENT').length,
          marketEvent: allTriggers.filter((t) => t.triggerType === 'MARKET_EVENT').length,
        },
      },
    },
  }).catch((err) => logger.error('[OUTREACH] Failed to create audit log:', err));

  return allTriggers;
}

// ============================================================
// HELPERS
// ============================================================

function getTargetAllocation(riskTolerance: string): Record<string, number> {
  const allocations: Record<string, Record<string, number>> = {
    CONSERVATIVE: { equity: 30, fixed_income: 55, alternatives: 5, cash: 10 },
    MODERATELY_CONSERVATIVE: { equity: 40, fixed_income: 45, alternatives: 5, cash: 10 },
    MODERATE: { equity: 55, fixed_income: 30, alternatives: 10, cash: 5 },
    MODERATELY_AGGRESSIVE: { equity: 70, fixed_income: 20, alternatives: 8, cash: 2 },
    AGGRESSIVE: { equity: 80, fixed_income: 10, alternatives: 8, cash: 2 },
  };
  return allocations[riskTolerance] || allocations.MODERATE;
}
