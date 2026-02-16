import { Router, Response } from 'express';
import { authenticate, createAuditLog } from '../middleware/auth';
import { AuthenticatedRequest, qs } from '../types';
import { prisma } from '../config/database';
import { createFinancialPlanSchema, updateFinancialPlanSchema, createGoalSchema, paginationSchema } from '../middleware/validation';
import { asyncHandler, NotFoundError, ForbiddenError } from '../middleware/errorHandler';

const router = Router();

// GET /api/financial-plans - List plans
router.get(
  '/',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { page, limit, sortOrder } = paginationSchema.parse(req.query);
    const clientId = qs(req.query.clientId);
    const status = qs(req.query.status);

    const where: any = {};
    if (clientId) where.clientId = clientId;
    if (status) where.status = status;

    if (req.user!.type === 'client') {
      where.clientId = req.user!.id;
    } else if (req.user!.role === 'ADVISOR') {
      where.client = { advisorId: req.user!.id };
    }

    const [plans, total] = await Promise.all([
      prisma.financialPlan.findMany({
        where,
        include: { client: { select: { id: true, firstName: true, lastName: true } } },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { updatedAt: sortOrder },
      }),
      prisma.financialPlan.count({ where }),
    ]);

    res.json({ data: plans, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  })
);

// GET /api/financial-plans/:id
router.get(
  '/:id',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const plan = await prisma.financialPlan.findUnique({
      where: { id: qs(req.params.id) },
      include: { client: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });
    if (!plan) throw new NotFoundError('Financial plan');
    if (req.user!.type === 'client' && plan.clientId !== req.user!.id) throw new ForbiddenError();
    res.json(plan);
  })
);

// POST /api/financial-plans
router.post(
  '/',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (req.user!.type === 'client') throw new ForbiddenError('Staff access required');

    const data = createFinancialPlanSchema.parse(req.body);
    const plan = await prisma.financialPlan.create({
      data: {
        clientId: data.clientId,
        name: data.name,
        planType: data.planType,
        summary: data.summary,
        assumptions: data.assumptions,
        projections: data.projections,
        recommendations: data.recommendations,
      },
    });

    await createAuditLog(req.user!.id, 'CREATE', 'financial_plan', plan.id, { clientId: data.clientId }, req);
    res.status(201).json(plan);
  })
);

// PUT /api/financial-plans/:id
router.put(
  '/:id',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (req.user!.type === 'client') throw new ForbiddenError();

    const data = updateFinancialPlanSchema.parse(req.body);
    const plan = await prisma.financialPlan.update({
      where: { id: qs(req.params.id) },
      data: {
        ...data,
        ...(data.status === 'APPROVED' && { approvedAt: new Date() }),
        ...(data.status && { lastReviewedAt: new Date() }),
      },
    });

    await createAuditLog(req.user!.id, 'UPDATE', 'financial_plan', plan.id, data, req);
    res.json(plan);
  })
);

// DELETE /api/financial-plans/:id
router.delete(
  '/:id',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (req.user!.type === 'client') throw new ForbiddenError();

    await prisma.financialPlan.update({
      where: { id: qs(req.params.id) },
      data: { status: 'ARCHIVED' },
    });

    await createAuditLog(req.user!.id, 'ARCHIVE', 'financial_plan', qs(req.params.id) ?? null, null, req);
    res.json({ message: 'Financial plan archived' });
  })
);

// ============================================
// GOALS
// ============================================

// GET /api/financial-plans/goals/:clientId
router.get(
  '/goals/:clientId',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const clientId = qs(req.params.clientId);
    if (req.user!.type === 'client' && req.user!.id !== clientId) throw new ForbiddenError();

    const goals = await prisma.goal.findMany({
      where: { clientId },
      orderBy: { priority: 'asc' },
    });

    res.json(goals);
  })
);

// POST /api/financial-plans/goals
router.post(
  '/goals',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const data = createGoalSchema.parse(req.body);

    const progress = data.currentAmount
      ? Number(((data.currentAmount / data.targetAmount) * 100).toFixed(2))
      : 0;

    const goal = await prisma.goal.create({
      data: {
        clientId: data.clientId,
        type: data.type,
        name: data.name,
        description: data.description,
        targetAmount: data.targetAmount,
        currentAmount: data.currentAmount || 0,
        targetDate: new Date(data.targetDate),
        priority: data.priority || 'MEDIUM',
        progress,
        isOnTrack: true,
      },
    });

    await createAuditLog(req.user!.id, 'CREATE', 'goal', goal.id, { clientId: data.clientId }, req);
    res.status(201).json(goal);
  })
);

// PUT /api/financial-plans/goals/:id
router.put(
  '/goals/:id',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { currentAmount, targetAmount, isOnTrack, ...rest } = req.body;

    const existing = await prisma.goal.findUnique({ where: { id: qs(req.params.id) } });
    if (!existing) throw new NotFoundError('Goal');

    const newTarget = targetAmount || Number(existing.targetAmount);
    const newCurrent = currentAmount ?? Number(existing.currentAmount);
    const progress = Number(((newCurrent / newTarget) * 100).toFixed(2));

    const goal = await prisma.goal.update({
      where: { id: qs(req.params.id) },
      data: {
        ...rest,
        ...(currentAmount !== undefined && { currentAmount }),
        ...(targetAmount !== undefined && { targetAmount }),
        progress,
        isOnTrack: isOnTrack ?? progress >= 50,
      },
    });

    res.json(goal);
  })
);

// DELETE /api/financial-plans/goals/:id
router.delete(
  '/goals/:id',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    await prisma.goal.delete({ where: { id: qs(req.params.id) } });
    res.json({ message: 'Goal deleted' });
  })
);

export default router;
