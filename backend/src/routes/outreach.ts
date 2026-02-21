import { Router, Response } from 'express';
import { authenticate, authorize, createAuditLog } from '../middleware/auth';
import { AuthenticatedRequest, qs } from '../types';
import { prisma } from '../config/database';
import { paginationSchema } from '../middleware/validation';
import { asyncHandler, ForbiddenError, NotFoundError, ValidationError } from '../middleware/errorHandler';
import { getSchedulerStatus, triggerJob } from '../services/scheduler';
import {
  outreachReviewSchema,
  outreachRuleCreateSchema,
  outreachRuleUpdateSchema,
} from '../middleware/validation';

const router = Router();

// All outreach routes require authentication
router.use(authenticate);

// ============================================================
// OUTREACH MESSAGES — Review, Approve, Reject
// ============================================================

// GET /api/outreach/messages — List outreach messages (filterable)
router.get(
  '/messages',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (req.user!.role !== 'ADMIN' && req.user!.role !== 'ADVISOR' && req.user!.role !== 'COMPLIANCE')
      throw new ForbiddenError();

    const { page, limit } = paginationSchema.parse(req.query);
    const status = qs(req.query.status);
    const clientId = qs(req.query.clientId);
    const priority = qs(req.query.priority);
    const triggerType = qs(req.query.triggerType);

    const where: any = {};
    if (status) where.status = status;
    if (clientId) where.clientId = clientId;
    if (priority) where.priority = priority;
    if (triggerType) {
      where.trigger = { triggerType };
    }

    const [messages, total] = await Promise.all([
      prisma.outreachMessage.findMany({
        where,
        include: {
          client: { select: { id: true, firstName: true, lastName: true, serviceTier: true } },
          trigger: { select: { id: true, triggerType: true, triggerData: true, detectedAt: true } },
          reviewer: { select: { id: true, firstName: true, lastName: true } },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.outreachMessage.count({ where }),
    ]);

    // Summary stats
    const stats = await prisma.outreachMessage.groupBy({
      by: ['status'],
      _count: true,
    });

    res.json({
      data: messages,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      stats: stats.map((s) => ({ status: s.status, count: s._count })),
    });
  })
);

// GET /api/outreach/messages/:id — Get single outreach message detail
router.get(
  '/messages/:id',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (req.user!.role !== 'ADMIN' && req.user!.role !== 'ADVISOR' && req.user!.role !== 'COMPLIANCE')
      throw new ForbiddenError();

    const id = qs(req.params.id)!;
    const message = await prisma.outreachMessage.findUnique({
      where: { id },
      include: {
        client: {
          select: {
            id: true, firstName: true, lastName: true, email: true,
            serviceTier: true, status: true,
            profile: { select: { riskTolerance: true, communicationPrefs: true } },
          },
        },
        trigger: {
          select: { id: true, triggerType: true, triggerData: true, detectedAt: true },
          include: { rule: { select: { name: true, description: true } } },
        },
        reviewer: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    if (!message) throw new NotFoundError('Outreach message not found');

    res.json(message);
  })
);

// POST /api/outreach/messages/:id/review — Approve or reject an outreach message
router.post(
  '/messages/:id/review',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (req.user!.role !== 'ADMIN' && req.user!.role !== 'ADVISOR' && req.user!.role !== 'COMPLIANCE')
      throw new ForbiddenError();

    const { action, notes, editedSubject, editedBody } = outreachReviewSchema.parse(req.body);
    const id = qs(req.params.id)!;

    const message = await prisma.outreachMessage.findUnique({
      where: { id },
    });

    if (!message) throw new NotFoundError('Outreach message not found');

    if (message.status !== 'PENDING_REVIEW' && message.status !== 'DRAFT') {
      throw new ValidationError(`Cannot review a message with status "${message.status}"`);
    }

    const updateData: any = {
      reviewedBy: req.user!.id,
      reviewedAt: new Date(),
      reviewNotes: notes || null,
    };

    if (action === 'approve') {
      updateData.status = 'APPROVED';
      // Apply edits if provided
      if (editedSubject) updateData.subject = editedSubject;
      if (editedBody) updateData.body = editedBody;
    } else if (action === 'reject') {
      updateData.status = 'REJECTED';
    }

    const updated = await prisma.outreachMessage.update({
      where: { id },
      data: updateData,
      include: {
        client: { select: { id: true, firstName: true, lastName: true } },
        reviewer: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // Audit log
    await createAuditLog(
      req.user!.id,
      `OUTREACH_${action.toUpperCase()}`,
      'outreach_message',
      message.id,
      {
        clientId: message.clientId,
        previousStatus: message.status,
        newStatus: updateData.status,
        hasEdits: !!(editedSubject || editedBody),
        notes,
      },
      req
    );

    res.json(updated);
  })
);

// POST /api/outreach/messages/:id/send — Mark approved message as sent
router.post(
  '/messages/:id/send',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (req.user!.role !== 'ADMIN' && req.user!.role !== 'ADVISOR')
      throw new ForbiddenError();

    const id = qs(req.params.id)!;
    const message = await prisma.outreachMessage.findUnique({
      where: { id },
    });

    if (!message) throw new NotFoundError('Outreach message not found');

    if (message.status !== 'APPROVED') {
      throw new ValidationError('Only approved messages can be sent');
    }

    // TODO: Integrate with email delivery service (SendGrid, SES, etc.)
    // For now, mark as sent and create a notification for the client
    const updated = await prisma.outreachMessage.update({
      where: { id },
      data: {
        status: 'SENT',
        sentAt: new Date(),
      },
    });

    // Create a notification for the client
    await prisma.notification.create({
      data: {
        clientId: message.clientId,
        type: 'SYSTEM',
        title: message.subject,
        message: message.body,
        actionUrl: '/portal/messages',
      },
    });

    // Audit log
    await createAuditLog(
      req.user!.id,
      'OUTREACH_SENT',
      'outreach_message',
      message.id,
      {
        clientId: message.clientId,
        channel: message.channel,
        sentAt: new Date().toISOString(),
      },
      req
    );

    res.json(updated);
  })
);

// ============================================================
// OUTREACH TRIGGERS — View detected triggers
// ============================================================

// GET /api/outreach/triggers — List all triggers
router.get(
  '/triggers',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (req.user!.role !== 'ADMIN' && req.user!.role !== 'COMPLIANCE')
      throw new ForbiddenError();

    const { page, limit } = paginationSchema.parse(req.query);
    const status = qs(req.query.status);
    const triggerType = qs(req.query.triggerType);
    const clientId = qs(req.query.clientId);

    const where: any = {};
    if (status) where.status = status;
    if (triggerType) where.triggerType = triggerType;
    if (clientId) where.clientId = clientId;

    const [triggers, total] = await Promise.all([
      prisma.outreachTrigger.findMany({
        where,
        include: {
          client: { select: { id: true, firstName: true, lastName: true } },
          rule: { select: { id: true, name: true, triggerType: true } },
          _count: { select: { messages: true } },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { detectedAt: 'desc' },
      }),
      prisma.outreachTrigger.count({ where }),
    ]);

    res.json({
      data: triggers,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  })
);

// ============================================================
// OUTREACH RULES — Manage trigger rules
// ============================================================

// GET /api/outreach/rules — List all outreach rules
router.get(
  '/rules',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (req.user!.role !== 'ADMIN' && req.user!.role !== 'COMPLIANCE')
      throw new ForbiddenError();

    const rules = await prisma.outreachRule.findMany({
      include: {
        _count: { select: { triggers: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json(rules);
  })
);

// POST /api/outreach/rules — Create a new outreach rule
router.post(
  '/rules',
  authorize('ADMIN'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const data = outreachRuleCreateSchema.parse(req.body);

    const rule = await prisma.outreachRule.create({ data });

    await createAuditLog(
      req.user!.id,
      'OUTREACH_RULE_CREATED',
      'outreach_rule',
      rule.id,
      { name: rule.name, triggerType: rule.triggerType },
      req
    );

    res.status(201).json(rule);
  })
);

// PUT /api/outreach/rules/:id — Update an outreach rule
router.put(
  '/rules/:id',
  authorize('ADMIN'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const data = outreachRuleUpdateSchema.parse(req.body);
    const id = qs(req.params.id)!;

    const rule = await prisma.outreachRule.update({
      where: { id },
      data,
    });

    await createAuditLog(
      req.user!.id,
      'OUTREACH_RULE_UPDATED',
      'outreach_rule',
      rule.id,
      data,
      req
    );

    res.json(rule);
  })
);

// ============================================================
// SCHEDULER — Status and manual triggers
// ============================================================

// GET /api/outreach/scheduler/status — View scheduler job status
router.get(
  '/scheduler/status',
  authorize('ADMIN'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const status = getSchedulerStatus();
    res.json({ jobs: status });
  })
);

// POST /api/outreach/scheduler/trigger/:jobName — Manually trigger a job
router.post(
  '/scheduler/trigger/:jobName',
  authorize('ADMIN'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const jobName = qs(req.params.jobName)!;
    const result = await triggerJob(jobName);

    if (!result.success) {
      throw new ValidationError(result.error || 'Failed to trigger job');
    }

    await createAuditLog(
      req.user!.id,
      'SCHEDULER_MANUAL_TRIGGER',
      'scheduler',
      null,
      { jobName },
      req
    );

    res.json({ message: `Job "${jobName}" triggered successfully`, ...result });
  })
);

// ============================================================
// OUTREACH DASHBOARD — Aggregated stats
// ============================================================

// GET /api/outreach/dashboard — Outreach overview metrics
router.get(
  '/dashboard',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (req.user!.role !== 'ADMIN' && req.user!.role !== 'ADVISOR' && req.user!.role !== 'COMPLIANCE')
      throw new ForbiddenError();

    const [
      pendingReview,
      approved,
      sent30d,
      rejected30d,
      triggersByType,
      recentMessages,
    ] = await Promise.all([
      prisma.outreachMessage.count({ where: { status: 'PENDING_REVIEW' } }),
      prisma.outreachMessage.count({ where: { status: 'APPROVED' } }),
      prisma.outreachMessage.count({
        where: { status: 'SENT', sentAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
      }),
      prisma.outreachMessage.count({
        where: { status: 'REJECTED', reviewedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
      }),
      prisma.outreachTrigger.groupBy({
        by: ['triggerType'],
        _count: true,
        where: { detectedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
      }),
      prisma.outreachMessage.findMany({
        where: { status: 'PENDING_REVIEW' },
        include: {
          client: { select: { id: true, firstName: true, lastName: true, serviceTier: true } },
          trigger: { select: { triggerType: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    res.json({
      overview: {
        pendingReview,
        approved,
        sent30d,
        rejected30d,
      },
      triggersByType: triggersByType.map((t) => ({ type: t.triggerType, count: t._count })),
      recentPending: recentMessages,
      schedulerStatus: getSchedulerStatus(),
    });
  })
);

export default router;
