import { Router, Response } from 'express';
import { authenticate, requireUser } from '../middleware/auth';
import { AuthenticatedRequest, AgentType, qs } from '../types';
import { aiAgentRequestSchema, orchestratedRequestSchema, sessionListSchema } from '../middleware/validation';
import { asyncHandler, ForbiddenError, NotFoundError } from '../middleware/errorHandler';
import { orchestrate } from '../services/agent-orchestrator';
import { getClientMemories } from '../services/agent-memory';
import { prisma } from '../config/database';

const router = Router();

// POST /api/ai/invoke - Invoke AI agent(s) via orchestrator
router.post(
  '/invoke',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const data = aiAgentRequestSchema.parse(req.body);

    // Compliance and marketing agents are staff-only
    if (data.agentType && ['compliance', 'marketing'].includes(data.agentType) && req.user!.type === 'client') {
      throw new ForbiddenError('This agent is staff-only');
    }

    // Clients can only query about their own data
    let clientId = data.clientId;
    if (req.user!.type === 'client') {
      clientId = req.user!.id;
    }

    // userId is for staff (User table FK) — clients pass undefined
    const userId = req.user!.type === 'user' ? req.user!.id : undefined;

    // Route through orchestrator — if agentType is provided, map to forceAgentType for backward compat
    const result = await orchestrate({
      prompt: data.prompt,
      clientId,
      context: data.context,
      forceAgentType: data.agentType as AgentType | undefined,
      userId,
    });

    res.json(result);
  })
);

// GET /api/ai/agents - List available agents
router.get(
  '/agents',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const agents = [
      {
        type: 'financial_planning',
        name: 'Financial Planning Assistant',
        description: 'Analyze financial data, create plans, calculate retirement readiness',
        availableTo: ['user', 'client'],
      },
      {
        type: 'investment_management',
        name: 'Investment Management Assistant',
        description: 'Portfolio analysis, rebalancing suggestions, tax-loss harvesting',
        availableTo: ['user', 'client'],
      },
      {
        type: 'tax_planning',
        name: 'Tax Planning Assistant',
        description: 'Tax-loss harvesting, Roth conversions, capital gains analysis, asset location',
        availableTo: ['user', 'client'],
      },
      {
        type: 'client_support',
        name: 'Client Support Assistant',
        description: 'Answer questions, explain concepts, help navigate the portal',
        availableTo: ['user', 'client'],
      },
      {
        type: 'compliance',
        name: 'Compliance Review Assistant',
        description: 'Review communications and recommendations for regulatory compliance',
        availableTo: ['user'],
      },
      {
        type: 'marketing',
        name: 'Marketing Content Assistant',
        description: 'Create compliant educational content and marketing materials',
        availableTo: ['user'],
      },
    ];

    // Filter based on user type
    const available = agents.filter((a) => a.availableTo.includes(req.user!.type));
    res.json(available);
  })
);

// GET /api/ai/sessions - List orchestration sessions (staff only)
router.get(
  '/sessions',
  authenticate,
  requireUser,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const params = sessionListSchema.parse(req.query);
    const where: any = {};

    if (params.clientId) where.clientId = params.clientId;
    if (params.status) where.status = params.status;

    const [sessions, total] = await Promise.all([
      prisma.agentSession.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
        include: {
          client: { select: { firstName: true, lastName: true, email: true } },
          user: { select: { firstName: true, lastName: true, email: true } },
          _count: { select: { handoffs: true } },
        },
      }),
      prisma.agentSession.count({ where }),
    ]);

    res.json({
      data: sessions,
      pagination: {
        page: params.page,
        limit: params.limit,
        total,
        totalPages: Math.ceil(total / params.limit),
      },
    });
  })
);

// GET /api/ai/sessions/:id - Session detail with handoff history (staff only)
router.get(
  '/sessions/:id',
  authenticate,
  requireUser,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const sessionId = qs(req.params.id)!;

    const session = await prisma.agentSession.findUnique({
      where: { id: sessionId },
      include: {
        client: { select: { firstName: true, lastName: true, email: true } },
        user: { select: { firstName: true, lastName: true, email: true } },
        handoffs: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!session) {
      throw new NotFoundError('Agent session');
    }

    res.json(session);
  })
);

// GET /api/ai/memories/:clientId - List agent memories for a client (staff only)
router.get(
  '/memories/:clientId',
  authenticate,
  requireUser,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const clientId = qs(req.params.clientId)!;
    const agentType = qs(req.query.agentType);
    const limit = qs(req.query.limit) ? parseInt(qs(req.query.limit)!, 10) : 50;

    const memories = await getClientMemories(clientId, agentType, limit);
    res.json({ data: memories, total: memories.length });
  })
);

// DELETE /api/ai/memories/:memoryId - Delete a specific memory (admin only)
router.delete(
  '/memories/:memoryId',
  authenticate,
  requireUser,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (req.user!.role !== 'ADMIN') {
      throw new ForbiddenError('Admin access required');
    }

    const memoryId = qs(req.params.memoryId)!;

    const memory = await prisma.agentMemory.findUnique({
      where: { id: memoryId },
    });

    if (!memory) {
      throw new NotFoundError('Agent memory');
    }

    await prisma.agentMemory.delete({
      where: { id: memoryId },
    });

    res.json({ message: 'Memory deleted', id: memoryId });
  })
);

export default router;
