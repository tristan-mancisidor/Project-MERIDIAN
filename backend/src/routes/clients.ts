import { Router, Response } from 'express';
import { authenticate, createAuditLog } from '../middleware/auth';
import { AuthenticatedRequest, qs } from '../types';
import { prisma } from '../config/database';
import { updateClientSchema, updateClientProfileSchema, paginationSchema } from '../middleware/validation';
import { asyncHandler, NotFoundError } from '../middleware/errorHandler';

const router = Router();

// GET /api/clients - List all clients (staff only)
router.get(
  '/',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (req.user!.type !== 'user') throw new NotFoundError();

    const { page, limit, sortBy, sortOrder } = paginationSchema.parse(req.query);
    const status = qs(req.query.status);
    const serviceTier = qs(req.query.serviceTier);
    const search = qs(req.query.search);
    const advisorId = qs(req.query.advisorId);

    const where: any = {};
    if (status) where.status = status;
    if (serviceTier) where.serviceTier = serviceTier;
    if (advisorId) where.advisorId = advisorId;
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (req.user!.role === 'ADVISOR') {
      where.advisorId = req.user!.id;
    }

    const [clients, total] = await Promise.all([
      prisma.client.findMany({
        where,
        select: {
          id: true, email: true, firstName: true, lastName: true, phone: true,
          status: true, serviceTier: true, custodian: true, createdAt: true,
          advisor: { select: { id: true, firstName: true, lastName: true } },
          profile: { select: { netWorth: true, riskTolerance: true } },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [sortBy || 'createdAt']: sortOrder },
      }),
      prisma.client.count({ where }),
    ]);

    res.json({
      data: clients,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  })
);

// GET /api/clients/:id - Get client details
router.get(
  '/:id',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const id = qs(req.params.id);

    if (req.user!.type === 'client' && req.user!.id !== id) {
      throw new NotFoundError('Client');
    }

    const client = await prisma.client.findUnique({
      where: { id },
      include: {
        profile: true,
        advisor: { select: { id: true, firstName: true, lastName: true, email: true } },
        goals: true,
        accounts: { include: { holdings: true } },
        feeSchedule: true,
      },
    });

    if (!client) throw new NotFoundError('Client');

    if (req.user!.type === 'user' && req.user!.role === 'ADVISOR' && client.advisorId !== req.user!.id) {
      throw new NotFoundError('Client');
    }

    const { passwordHash, ...clientData } = client;
    res.json(clientData);
  })
);

// PUT /api/clients/:id - Update client
router.put(
  '/:id',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const id = qs(req.params.id);
    const data = updateClientSchema.parse(req.body);

    const client = await prisma.client.update({
      where: { id },
      data: {
        ...data,
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
      },
      select: {
        id: true, email: true, firstName: true, lastName: true, phone: true,
        status: true, serviceTier: true, custodian: true, updatedAt: true,
      },
    });

    await createAuditLog(req.user!.id, 'UPDATE', 'client', id ?? null, data, req);
    res.json(client);
  })
);

// GET /api/clients/:id/profile - Get client financial profile
router.get(
  '/:id/profile',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const id = qs(req.params.id);
    if (req.user!.type === 'client' && req.user!.id !== id) throw new NotFoundError();

    const profile = await prisma.clientProfile.findUnique({ where: { clientId: id } });
    if (!profile) throw new NotFoundError('Client profile');

    res.json(profile);
  })
);

// PUT /api/clients/:id/profile - Update client financial profile
router.put(
  '/:id/profile',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const id = qs(req.params.id);
    const data = updateClientProfileSchema.parse(req.body);

    let netWorth: number | undefined;
    if (data.assetBreakdown || data.liabilityBreakdown) {
      const totalAssets = data.assetBreakdown
        ? Object.values(data.assetBreakdown).reduce((sum, v) => sum + (v || 0), 0)
        : undefined;
      const totalLiabilities = data.liabilityBreakdown
        ? Object.values(data.liabilityBreakdown).reduce((sum, v) => sum + (v || 0), 0)
        : undefined;
      if (totalAssets !== undefined && totalLiabilities !== undefined) {
        netWorth = totalAssets - totalLiabilities;
      }
    }

    const profile = await prisma.clientProfile.upsert({
      where: { clientId: id },
      update: {
        ...data,
        ...(netWorth !== undefined && { netWorth }),
      },
      create: { clientId: id!, ...data },
    });

    await createAuditLog(req.user!.id, 'UPDATE', 'client_profile', id ?? null, data, req);
    res.json(profile);
  })
);

// GET /api/clients/:id/dashboard - Client dashboard data
router.get(
  '/:id/dashboard',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const id = qs(req.params.id);
    if (req.user!.type === 'client' && req.user!.id !== id) throw new NotFoundError();

    const [client, profile, accounts, goals, tasks, recentTransactions] = await Promise.all([
      prisma.client.findUnique({
        where: { id },
        select: { id: true, firstName: true, lastName: true, serviceTier: true },
      }),
      prisma.clientProfile.findUnique({ where: { clientId: id } }),
      prisma.account.findMany({
        where: { clientId: id, isActive: true },
        include: { holdings: true },
      }),
      prisma.goal.findMany({ where: { clientId: id } }),
      prisma.task.findMany({
        where: { clientId: id, status: { in: ['PENDING', 'IN_PROGRESS'] } },
        orderBy: { dueDate: 'asc' },
        take: 10,
      }),
      prisma.transaction.findMany({
        where: { account: { clientId: id } },
        orderBy: { executedAt: 'desc' },
        take: 10,
        include: { account: { select: { accountName: true } } },
      }),
    ]);

    if (!client) throw new NotFoundError('Client');

    const portfolioValue = accounts.reduce((sum, a) => sum + Number(a.currentValue), 0);
    const ytdReturn = accounts.length > 0
      ? accounts.reduce((sum, a) => sum + Number(a.ytdReturn) * Number(a.currentValue), 0) / portfolioValue
      : 0;

    const activePlan = await prisma.financialPlan.findFirst({
      where: { clientId: id, status: { in: ['ACTIVE', 'APPROVED'] } },
      orderBy: { updatedAt: 'desc' },
    });

    const dashboard = {
      client,
      metrics: {
        netWorth: Number(profile?.netWorth || 0),
        netWorthChange: 2.3,
        portfolioValue,
        portfolioChange: 1.8,
        ytdReturn: Number((ytdReturn * 100).toFixed(2)),
        benchmarkReturn: 8.2,
        retirementScore: activePlan?.retirementScore || 0,
      },
      goals: goals.map((g) => ({
        id: g.id,
        name: g.name,
        type: g.type,
        targetAmount: Number(g.targetAmount),
        currentAmount: Number(g.currentAmount),
        progress: Number(g.progress),
        isOnTrack: g.isOnTrack,
        targetDate: g.targetDate,
      })),
      recentActivity: recentTransactions.map((t) => ({
        id: t.id,
        date: t.executedAt.toISOString().split('T')[0],
        description: t.description,
        type: t.type,
      })),
      actionItems: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        dueDate: t.dueDate?.toISOString().split('T')[0] || '',
        completed: t.status === 'COMPLETED',
        category: t.category || 'general',
      })),
      accounts: accounts.map((a) => ({
        id: a.id,
        name: a.accountName,
        type: a.accountType,
        value: Number(a.currentValue),
        ytdReturn: Number(a.ytdReturn),
        holdingsCount: a.holdings.length,
      })),
    };

    res.json(dashboard);
  })
);

export default router;
