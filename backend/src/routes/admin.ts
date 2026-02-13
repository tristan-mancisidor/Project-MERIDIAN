import { Router, Response } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { AuthenticatedRequest, qs } from '../types';
import { prisma } from '../config/database';
import { paginationSchema } from '../middleware/validation';
import { asyncHandler, ForbiddenError } from '../middleware/errorHandler';

const router = Router();

// All admin routes require authentication and ADMIN role
router.use(authenticate);

// GET /api/admin/dashboard - Admin overview metrics
router.get(
  '/dashboard',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (req.user!.role !== 'ADMIN' && req.user!.role !== 'COMPLIANCE') throw new ForbiddenError();

    const [
      totalClients,
      activeClients,
      prospects,
      totalAdvisors,
      totalAUM,
      pendingTasks,
      openConversations,
      pendingCompliance,
      recentAIInteractions,
    ] = await Promise.all([
      prisma.client.count(),
      prisma.client.count({ where: { status: 'ACTIVE' } }),
      prisma.client.count({ where: { status: 'PROSPECT' } }),
      prisma.user.count({ where: { role: 'ADVISOR', isActive: true } }),
      prisma.account.aggregate({ _sum: { currentValue: true }, where: { isActive: true } }),
      prisma.task.count({ where: { status: { in: ['PENDING', 'IN_PROGRESS'] } } }),
      prisma.conversation.count({ where: { status: 'OPEN' } }),
      prisma.complianceCheck.count({ where: { status: { in: ['PENDING', 'FLAGGED'] } } }),
      prisma.aIInteraction.count({ where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } }),
    ]);

    // Revenue by tier
    const tierBreakdown = await prisma.client.groupBy({
      by: ['serviceTier'],
      where: { status: 'ACTIVE' },
      _count: true,
    });

    // Clients by status
    const statusBreakdown = await prisma.client.groupBy({
      by: ['status'],
      _count: true,
    });

    res.json({
      overview: {
        totalClients,
        activeClients,
        prospects,
        totalAdvisors,
        totalAUM: Number(totalAUM._sum.currentValue || 0),
        pendingTasks,
        openConversations,
        pendingCompliance,
        recentAIInteractions,
      },
      tierBreakdown: tierBreakdown.map((t) => ({ tier: t.serviceTier, count: t._count })),
      statusBreakdown: statusBreakdown.map((s) => ({ status: s.status, count: s._count })),
    });
  })
);

// GET /api/admin/users - List all staff users
router.get(
  '/users',
  authorize('ADMIN'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const users = await prisma.user.findMany({
      select: {
        id: true, email: true, firstName: true, lastName: true,
        role: true, isActive: true, lastLoginAt: true, createdAt: true,
        _count: { select: { clients: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(users);
  })
);

// PUT /api/admin/users/:id - Update staff user
router.put(
  '/users/:id',
  authorize('ADMIN'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { role, isActive } = req.body;

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        ...(role && { role }),
        ...(isActive !== undefined && { isActive }),
      },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, isActive: true },
    });

    res.json(user);
  })
);

// GET /api/admin/audit-logs - View audit trail
router.get(
  '/audit-logs',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (req.user!.role !== 'ADMIN' && req.user!.role !== 'COMPLIANCE') throw new ForbiddenError();

    const { page, limit } = paginationSchema.parse(req.query);
    const action = qs(req.query.action);
    const entity = qs(req.query.entity);
    const userId = qs(req.query.userId);

    const where: any = {};
    if (action) where.action = action;
    if (entity) where.entity = entity;
    if (userId) where.userId = userId;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.json({ data: logs, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  })
);

// GET /api/admin/compliance - Compliance dashboard
router.get(
  '/compliance',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (req.user!.role !== 'ADMIN' && req.user!.role !== 'COMPLIANCE') throw new ForbiddenError();

    const compStatus = qs(req.query.status);
    const where: any = {};
    if (compStatus) where.status = compStatus;

    const checks = await prisma.complianceCheck.findMany({
      where,
      include: { client: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const summary = await prisma.complianceCheck.groupBy({
      by: ['status'],
      _count: true,
    });

    res.json({ checks, summary: summary.map((s) => ({ status: s.status, count: s._count })) });
  })
);

// POST /api/admin/compliance/:id/resolve
router.post(
  '/compliance/:id/resolve',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (req.user!.role !== 'ADMIN' && req.user!.role !== 'COMPLIANCE') throw new ForbiddenError();

    const { status, notes } = req.body;

    const check = await prisma.complianceCheck.update({
      where: { id: req.params.id },
      data: {
        status: status || 'RESOLVED',
        resolvedBy: req.user!.id,
        resolvedAt: new Date(),
        details: notes ? { resolution: notes } : undefined,
      },
    });

    res.json(check);
  })
);

// GET /api/admin/ai-interactions - View AI agent usage
router.get(
  '/ai-interactions',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (req.user!.role !== 'ADMIN') throw new ForbiddenError();

    const { page, limit } = paginationSchema.parse(req.query);
    const agentType = qs(req.query.agentType);
    const complianceFlag = qs(req.query.complianceFlag);

    const where: any = {};
    if (agentType) where.agentType = agentType;
    if (complianceFlag === 'true') where.complianceFlag = true;

    const [interactions, total] = await Promise.all([
      prisma.aIInteraction.findMany({
        where,
        include: {
          user: { select: { id: true, firstName: true, lastName: true } },
          client: { select: { id: true, firstName: true, lastName: true } },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.aIInteraction.count({ where }),
    ]);

    // Usage stats
    const stats = await prisma.aIInteraction.aggregate({
      _count: true,
      _sum: { tokensUsed: true },
      _avg: { latencyMs: true },
      where: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
    });

    res.json({
      data: interactions,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      stats: {
        totalInteractions30d: stats._count,
        totalTokens30d: stats._sum.tokensUsed || 0,
        avgLatencyMs: Math.round(stats._avg.latencyMs || 0),
      },
    });
  })
);

// GET /api/admin/fee-schedules - View all fee schedules
router.get(
  '/fee-schedules',
  authorize('ADMIN'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const schedules = await prisma.feeSchedule.findMany({
      include: {
        client: {
          select: {
            id: true, firstName: true, lastName: true, serviceTier: true,
            accounts: { where: { isActive: true }, select: { currentValue: true } },
          },
        },
      },
      orderBy: { client: { lastName: 'asc' } },
    });

    const enriched = schedules.map((s) => {
      const totalAUM = s.client.accounts.reduce((sum, a) => sum + Number(a.currentValue), 0);
      const annualFee = s.aumRate ? totalAUM * Number(s.aumRate) : Number(s.flatFeeAmount || 0);
      return { ...s, totalAUM, estimatedAnnualFee: annualFee };
    });

    res.json(enriched);
  })
);

export default router;
