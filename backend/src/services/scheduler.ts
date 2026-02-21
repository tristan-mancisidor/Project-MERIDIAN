import { prisma } from '../config/database';
import { logger } from '../middleware/logger';
import { runAllTriggerDetections } from './outreach-triggers';
import { draftMessagesForPendingTriggers } from './outreach-messages';

// ============================================================
// Scheduler Service
// Lightweight cron-based job runner using setInterval.
// No external dependencies (no node-cron, bull, etc.).
// Runs trigger detection + message drafting on a configurable
// schedule, with mutex locking to prevent concurrent runs.
// ============================================================

interface ScheduledJob {
  name: string;
  intervalMs: number;
  handler: () => Promise<void>;
  timer?: ReturnType<typeof setInterval>;
  isRunning: boolean;
  lastRunAt?: Date;
  lastError?: string;
  runCount: number;
}

const jobs: Map<string, ScheduledJob> = new Map();

// ============================================================
// JOB DEFINITIONS
// ============================================================

/**
 * Outreach pipeline: detect triggers, then draft messages.
 * Default: every 6 hours.
 */
async function outreachPipeline(): Promise<void> {
  const startTime = Date.now();
  logger.info('[SCHEDULER] Starting outreach pipeline...');

  try {
    // Step 1: Detect triggers across all active rules
    const triggers = await runAllTriggerDetections();
    logger.info(`[SCHEDULER] Trigger detection found ${triggers.length} new triggers`);

    // Step 2: Draft messages for pending triggers
    if (triggers.length > 0) {
      const results = await draftMessagesForPendingTriggers();
      logger.info(`[SCHEDULER] Message drafting complete: ${results.length} messages processed`);
    }

    const latencyMs = Date.now() - startTime;
    logger.info(`[SCHEDULER] Outreach pipeline complete in ${latencyMs}ms`);

    // Audit log
    await prisma.auditLog.create({
      data: {
        action: 'SCHEDULER_RUN',
        entity: 'scheduler',
        details: {
          job: 'outreach_pipeline',
          triggersDetected: triggers.length,
          latencyMs,
          status: 'success',
        },
      },
    }).catch((err) => logger.error('[SCHEDULER] Failed to create audit log:', err));
  } catch (error: any) {
    logger.error('[SCHEDULER] Outreach pipeline failed:', { error: error.message });

    await prisma.auditLog.create({
      data: {
        action: 'SCHEDULER_ERROR',
        entity: 'scheduler',
        details: {
          job: 'outreach_pipeline',
          error: error.message,
          status: 'failed',
        },
      },
    }).catch(() => {});
  }
}

/**
 * Retry failed triggers: re-process triggers stuck in ERROR state.
 * Default: every 12 hours.
 */
async function retryFailedTriggers(): Promise<void> {
  logger.info('[SCHEDULER] Retrying failed triggers...');

  const failedTriggers = await prisma.outreachTrigger.findMany({
    where: { status: 'ERROR' },
    take: 20,
  });

  if (failedTriggers.length === 0) {
    logger.debug('[SCHEDULER] No failed triggers to retry');
    return;
  }

  // Reset to DETECTED so the pipeline picks them up
  await prisma.outreachTrigger.updateMany({
    where: { id: { in: failedTriggers.map((t) => t.id) } },
    data: { status: 'DETECTED' },
  });

  logger.info(`[SCHEDULER] Reset ${failedTriggers.length} failed triggers for retry`);

  // Now draft messages for them
  await draftMessagesForPendingTriggers();
}

// ============================================================
// SCHEDULER LIFECYCLE
// ============================================================

/**
 * Registers and starts all scheduled jobs.
 * Safe to call multiple times — idempotent.
 */
export function startScheduler(): void {
  logger.info('[SCHEDULER] Initializing scheduler...');

  // Parse intervals from environment or use defaults
  const outreachIntervalMs = parseInterval(process.env.OUTREACH_INTERVAL_MS, 6 * 60 * 60 * 1000); // 6 hours
  const retryIntervalMs = parseInterval(process.env.OUTREACH_RETRY_INTERVAL_MS, 12 * 60 * 60 * 1000); // 12 hours

  registerJob('outreach_pipeline', outreachIntervalMs, outreachPipeline);
  registerJob('retry_failed_triggers', retryIntervalMs, retryFailedTriggers);

  // Seed default outreach rules if none exist
  seedDefaultRules().catch((err) =>
    logger.error('[SCHEDULER] Failed to seed default rules:', err)
  );

  logger.info(`[SCHEDULER] Scheduler started with ${jobs.size} jobs:`);
  for (const [name, job] of jobs) {
    logger.info(`  - ${name}: every ${formatInterval(job.intervalMs)}`);
  }
}

/**
 * Stops all scheduled jobs gracefully.
 */
export function stopScheduler(): void {
  logger.info('[SCHEDULER] Stopping scheduler...');

  for (const [name, job] of jobs) {
    if (job.timer) {
      clearInterval(job.timer);
      job.timer = undefined;
    }
    logger.info(`[SCHEDULER] Stopped job: ${name}`);
  }

  jobs.clear();
  logger.info('[SCHEDULER] Scheduler stopped');
}

/**
 * Returns status of all scheduled jobs.
 */
export function getSchedulerStatus(): Array<{
  name: string;
  intervalMs: number;
  isRunning: boolean;
  lastRunAt?: Date;
  lastError?: string;
  runCount: number;
}> {
  return Array.from(jobs.values()).map((job) => ({
    name: job.name,
    intervalMs: job.intervalMs,
    isRunning: job.isRunning,
    lastRunAt: job.lastRunAt,
    lastError: job.lastError,
    runCount: job.runCount,
  }));
}

/**
 * Manually trigger a specific job (for admin use / testing).
 */
export async function triggerJob(jobName: string): Promise<{ success: boolean; error?: string }> {
  const job = jobs.get(jobName);
  if (!job) {
    return { success: false, error: `Job "${jobName}" not found` };
  }

  if (job.isRunning) {
    return { success: false, error: `Job "${jobName}" is already running` };
  }

  // Run the job in the background (don't await)
  executeJob(job).catch((err) =>
    logger.error(`[SCHEDULER] Manual trigger of ${jobName} failed:`, err)
  );

  return { success: true };
}

// ============================================================
// INTERNAL HELPERS
// ============================================================

function registerJob(name: string, intervalMs: number, handler: () => Promise<void>): void {
  // Don't register duplicates
  if (jobs.has(name)) {
    logger.warn(`[SCHEDULER] Job "${name}" already registered — skipping`);
    return;
  }

  const job: ScheduledJob = {
    name,
    intervalMs,
    handler,
    isRunning: false,
    runCount: 0,
  };

  // Start the interval timer
  job.timer = setInterval(() => {
    executeJob(job).catch((err) =>
      logger.error(`[SCHEDULER] Unhandled error in job ${name}:`, err)
    );
  }, intervalMs);

  jobs.set(name, job);
}

async function executeJob(job: ScheduledJob): Promise<void> {
  // Mutex: skip if already running
  if (job.isRunning) {
    logger.warn(`[SCHEDULER] Skipping ${job.name} — previous run still in progress`);
    return;
  }

  job.isRunning = true;
  job.lastRunAt = new Date();

  try {
    await job.handler();
    job.lastError = undefined;
    job.runCount++;
  } catch (error: any) {
    job.lastError = error.message;
    logger.error(`[SCHEDULER] Job ${job.name} failed:`, { error: error.message });
  } finally {
    job.isRunning = false;
  }
}

function parseInterval(value: string | undefined, defaultMs: number): number {
  if (!value) return defaultMs;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) || parsed < 60000 ? defaultMs : parsed; // Minimum 1 minute
}

function formatInterval(ms: number): string {
  if (ms >= 86400000) return `${ms / 86400000}d`;
  if (ms >= 3600000) return `${ms / 3600000}h`;
  if (ms >= 60000) return `${ms / 60000}m`;
  return `${ms / 1000}s`;
}

// ============================================================
// DEFAULT RULE SEEDING
// Creates default outreach rules if none exist in the database.
// ============================================================

async function seedDefaultRules(): Promise<void> {
  const existingCount = await prisma.outreachRule.count();
  if (existingCount > 0) {
    logger.debug('[SCHEDULER] Outreach rules already exist — skipping seed');
    return;
  }

  const defaultRules = [
    {
      name: 'Portfolio Drift Alert',
      triggerType: 'PORTFOLIO_DRIFT' as const,
      agentType: 'investment_management',
      priority: 'HIGH' as const,
      cooldownDays: 30,
      description: 'Triggers when any asset class drifts more than 5% from target allocation',
      config: { driftThresholdPct: 5 },
    },
    {
      name: 'Goal Off Track',
      triggerType: 'GOAL_OFF_TRACK' as const,
      agentType: 'financial_planning',
      priority: 'HIGH' as const,
      cooldownDays: 60,
      description: 'Triggers when a client goal is marked as off-track',
      config: {},
    },
    {
      name: 'Account Milestone',
      triggerType: 'ACCOUNT_MILESTONE' as const,
      agentType: 'client_support',
      priority: 'MEDIUM' as const,
      cooldownDays: 90,
      description: 'Triggers when total portfolio crosses a significant value threshold',
      config: { thresholds: [100000, 250000, 500000, 1000000, 2500000, 5000000] },
    },
    {
      name: 'Plan Review Due',
      triggerType: 'REVIEW_DUE' as const,
      agentType: 'financial_planning',
      priority: 'MEDIUM' as const,
      cooldownDays: 90,
      description: 'Triggers when a financial plan review date is within 14 days',
      config: {},
    },
    {
      name: 'Life Event Detected',
      triggerType: 'LIFE_EVENT' as const,
      agentType: 'financial_planning',
      priority: 'HIGH' as const,
      cooldownDays: 30,
      description: 'Triggers when agent memory detects a significant life event from conversation',
      config: { lookbackDays: 30 },
    },
    {
      name: 'Market Event Alert',
      triggerType: 'MARKET_EVENT' as const,
      agentType: 'investment_management',
      priority: 'URGENT' as const,
      cooldownDays: 7,
      description: 'Triggers on significant market events (stub — requires market data feed)',
      config: {},
      isActive: false, // Disabled until market data feed is configured
    },
  ];

  for (const rule of defaultRules) {
    await prisma.outreachRule.create({ data: rule });
  }

  logger.info(`[SCHEDULER] Seeded ${defaultRules.length} default outreach rules`);
}
