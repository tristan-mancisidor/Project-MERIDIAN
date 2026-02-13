import { z } from 'zod';

// ============================================
// AUTH SCHEMAS
// ============================================
export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const registerUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  role: z.enum(['ADMIN', 'ADVISOR', 'SUPPORT', 'COMPLIANCE']).optional(),
});

export const registerClientSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  phone: z.string().optional(),
  serviceTier: z.enum(['ESSENTIAL', 'PREMIER', 'ELITE', 'PLANNING_ONLY']).optional(),
});

// ============================================
// CLIENT SCHEMAS
// ============================================
export const updateClientSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  phone: z.string().optional(),
  dateOfBirth: z.string().datetime().optional(),
  status: z.enum(['PROSPECT', 'ONBOARDING', 'ACTIVE', 'INACTIVE', 'TERMINATED']).optional(),
  serviceTier: z.enum(['ESSENTIAL', 'PREMIER', 'ELITE', 'PLANNING_ONLY']).optional(),
  custodian: z.enum(['FIDELITY', 'SCHWAB']).optional(),
  advisorId: z.string().uuid().optional(),
});

export const updateClientProfileSchema = z.object({
  maritalStatus: z.string().optional(),
  occupation: z.string().optional(),
  employer: z.string().optional(),
  stateOfResidence: z.string().optional(),
  riskTolerance: z.enum(['CONSERVATIVE', 'MODERATELY_CONSERVATIVE', 'MODERATE', 'MODERATELY_AGGRESSIVE', 'AGGRESSIVE']).optional(),
  investmentExperience: z.string().optional(),
  annualIncome: z.number().positive().optional(),
  annualExpenses: z.number().positive().optional(),
  taxFilingStatus: z.string().optional(),
  marginalTaxBracket: z.number().min(0).max(100).optional(),
  esgPreference: z.boolean().optional(),
  excludedSectors: z.array(z.string()).optional(),
  dependents: z.array(z.object({ name: z.string(), age: z.number(), relationship: z.string() })).optional(),
  assetBreakdown: z.record(z.number()).optional(),
  liabilityBreakdown: z.record(z.number()).optional(),
  insuranceCoverage: z.record(z.boolean()).optional(),
  communicationPrefs: z.object({
    frequency: z.string().optional(),
    channel: z.string().optional(),
    time: z.string().optional(),
  }).optional(),
});

// ============================================
// FINANCIAL PLAN SCHEMAS
// ============================================
export const createFinancialPlanSchema = z.object({
  clientId: z.string().uuid(),
  name: z.string().min(1).max(200),
  planType: z.string(),
  summary: z.string().optional(),
  assumptions: z.record(z.any()).optional(),
  projections: z.any().optional(),
  recommendations: z.any().optional(),
});

export const updateFinancialPlanSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  status: z.enum(['DRAFT', 'IN_REVIEW', 'APPROVED', 'ACTIVE', 'ARCHIVED']).optional(),
  summary: z.string().optional(),
  assumptions: z.record(z.any()).optional(),
  projections: z.any().optional(),
  recommendations: z.any().optional(),
  retirementScore: z.number().min(0).max(100).optional(),
});

// ============================================
// GOAL SCHEMAS
// ============================================
export const createGoalSchema = z.object({
  clientId: z.string().uuid(),
  type: z.enum(['RETIREMENT', 'EDUCATION', 'HOME_PURCHASE', 'DEBT_PAYOFF', 'EMERGENCY_FUND', 'TRAVEL', 'CHARITABLE', 'BUSINESS', 'OTHER']),
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  targetAmount: z.number().positive(),
  currentAmount: z.number().min(0).optional(),
  targetDate: z.string().datetime(),
  priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).optional(),
});

// ============================================
// INVESTMENT SCHEMAS
// ============================================
export const createAccountSchema = z.object({
  clientId: z.string().uuid(),
  accountNumber: z.string().min(1),
  accountType: z.enum(['INDIVIDUAL', 'JOINT', 'TRADITIONAL_IRA', 'ROTH_IRA', 'SEP_IRA', 'ROLLOVER_IRA', 'TRUST', 'ESTATE', 'CUSTODIAL', 'EDUCATION_529', 'HSA', 'CORPORATE']),
  accountName: z.string().min(1),
  custodian: z.enum(['FIDELITY', 'SCHWAB']),
  currentValue: z.number().min(0).optional(),
});

export const createTransactionSchema = z.object({
  accountId: z.string().uuid(),
  type: z.enum(['BUY', 'SELL', 'DIVIDEND', 'INTEREST', 'DEPOSIT', 'WITHDRAWAL', 'FEE', 'TRANSFER', 'REBALANCE', 'TAX_LOSS_HARVEST']),
  symbol: z.string().optional(),
  description: z.string(),
  quantity: z.number().optional(),
  price: z.number().optional(),
  amount: z.number(),
  fees: z.number().min(0).optional(),
  executedAt: z.string().datetime(),
});

// ============================================
// MESSAGE SCHEMAS
// ============================================
export const createConversationSchema = z.object({
  clientId: z.string().uuid(),
  subject: z.string().min(1).max(300),
  channel: z.string().optional(),
});

export const sendMessageSchema = z.object({
  conversationId: z.string().uuid(),
  content: z.string().min(1),
  senderType: z.enum(['CLIENT', 'ADVISOR', 'SYSTEM', 'AI_AGENT']),
});

// ============================================
// TASK SCHEMAS
// ============================================
export const createTaskSchema = z.object({
  clientId: z.string().uuid().optional(),
  assigneeId: z.string().uuid().optional(),
  title: z.string().min(1).max(300),
  description: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  category: z.string().optional(),
  dueDate: z.string().datetime().optional(),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  description: z.string().optional(),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  assigneeId: z.string().uuid().optional(),
  dueDate: z.string().datetime().optional(),
});

// ============================================
// AI AGENT SCHEMAS
// ============================================
export const aiAgentRequestSchema = z.object({
  agentType: z.enum(['financial_planning', 'investment_management', 'compliance', 'client_support', 'marketing']),
  prompt: z.string().min(1).max(5000),
  clientId: z.string().uuid().optional(),
  context: z.record(z.any()).optional(),
});

// ============================================
// DOCUMENT SCHEMAS
// ============================================
export const createDocumentSchema = z.object({
  clientId: z.string().uuid(),
  name: z.string().min(1).max(300),
  type: z.enum(['STATEMENT', 'TAX_FORM', 'CONTRACT', 'IPS', 'FINANCIAL_PLAN', 'REPORT', 'CORRESPONDENCE', 'COMPLIANCE', 'OTHER']),
  category: z.string(),
  description: z.string().optional(),
});

// ============================================
// MEETING SCHEMAS
// ============================================
export const createMeetingSchema = z.object({
  clientId: z.string().uuid(),
  advisorId: z.string().uuid(),
  title: z.string().min(1).max(300),
  description: z.string().optional(),
  type: z.enum(['DISCOVERY', 'ONBOARDING', 'REVIEW', 'PLANNING', 'AD_HOC']).optional(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  location: z.string().optional(),
});

// ============================================
// PAGINATION
// ============================================
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});
