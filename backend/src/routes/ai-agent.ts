import { Router, Response } from 'express';
import { authenticate, requireUser } from '../middleware/auth';
import { AuthenticatedRequest, qs } from '../types';
import { aiAgentRequestSchema } from '../middleware/validation';
import { asyncHandler, ForbiddenError, NotFoundError } from '../middleware/errorHandler';
import { invokeAgent } from '../services/ai-agent';
import { getClientMemories } from '../services/agent-memory';
import { prisma } from '../config/database';

const router = Router();

// POST /api/ai/invoke - Invoke an AI agent
router.post(
  '/invoke',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const data = aiAgentRequestSchema.parse(req.body);

    // Compliance and marketing agents are staff-only
    if (['compliance', 'marketing'].includes(data.agentType) && req.user!.type === 'client') {
      throw new ForbiddenError('This agent is staff-only');
    }

    // Clients can only query about their own data
    if (req.user!.type === 'client') {
      data.clientId = req.user!.id;
    }

    // userId is for staff (User table FK) — clients pass undefined
    const userId = req.user!.type === 'user' ? req.user!.id : undefined;
    const result = await invokeAgent(data, userId);

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
