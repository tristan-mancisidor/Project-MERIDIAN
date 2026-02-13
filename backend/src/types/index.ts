import { Request } from 'express';
import { JwtPayload } from '../middleware/auth';

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  details?: any;
}

export interface DashboardMetrics {
  netWorth: number;
  netWorthChange: number;
  portfolioValue: number;
  portfolioChange: number;
  ytdReturn: number;
  benchmarkReturn: number;
  retirementScore: number;
}

export interface GoalProgress {
  id: string;
  name: string;
  type: string;
  targetAmount: number;
  currentAmount: number;
  progress: number;
  isOnTrack: boolean;
  targetDate: Date;
}

export interface RecentActivity {
  id: string;
  date: string;
  description: string;
  type: string;
}

export interface ActionItem {
  id: string;
  title: string;
  dueDate: string;
  completed: boolean;
  category: string;
}

export type AgentType =
  | 'financial_planning'
  | 'investment_management'
  | 'compliance'
  | 'client_support'
  | 'marketing';

export interface AIAgentRequest {
  agentType: AgentType;
  prompt: string;
  clientId?: string;
  context?: Record<string, any>;
}

export interface AIAgentResponse {
  response: string;
  agentType: AgentType;
  model: string;
  tokensUsed?: number;
  latencyMs: number;
  complianceFlag: boolean;
  metadata?: Record<string, any>;
}

/** Safely extract a single string from req.query */
export function qs(val: unknown): string | undefined {
  if (typeof val === 'string') return val;
  if (Array.isArray(val) && typeof val[0] === 'string') return val[0];
  return undefined;
}
