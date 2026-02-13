import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';
import { aiAgentRequestSchema } from '../middleware/validation';
import { asyncHandler, ForbiddenError } from '../middleware/errorHandler';
import { invokeAgent } from '../services/ai-agent';

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

    const result = await invokeAgent(data, req.user!.id);

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

export default router;
