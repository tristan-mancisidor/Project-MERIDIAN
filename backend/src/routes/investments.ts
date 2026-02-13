import { Router, Response } from 'express';
import { authenticate, createAuditLog } from '../middleware/auth';
import { AuthenticatedRequest, qs } from '../types';
import { prisma } from '../config/database';
import { createAccountSchema, createTransactionSchema, paginationSchema } from '../middleware/validation';
import { asyncHandler, NotFoundError, ForbiddenError } from '../middleware/errorHandler';

const router = Router();

// ============================================
// ACCOUNTS
// ============================================

// GET /api/investments/accounts
router.get(
  '/accounts',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const clientId = qs(req.query.clientId);
    const where: any = { isActive: true };

    if (req.user!.type === 'client') {
      where.clientId = req.user!.id;
    } else if (clientId) {
      where.clientId = clientId;
    }

    const accounts = await prisma.account.findMany({
      where,
      include: {
        holdings: { orderBy: { weight: 'desc' } },
        client: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { currentValue: 'desc' },
    });

    res.json(accounts);
  })
);

// GET /api/investments/accounts/:id
router.get(
  '/accounts/:id',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const account = await prisma.account.findUnique({
      where: { id: req.params.id },
      include: {
        holdings: { orderBy: { weight: 'desc' } },
        transactions: { orderBy: { executedAt: 'desc' }, take: 50 },
        client: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!account) throw new NotFoundError('Account');
    if (req.user!.type === 'client' && account.clientId !== req.user!.id) throw new ForbiddenError();
    res.json(account);
  })
);

// POST /api/investments/accounts
router.post(
  '/accounts',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (req.user!.type === 'client') throw new ForbiddenError();

    const data = createAccountSchema.parse(req.body);
    const account = await prisma.account.create({
      data: {
        clientId: data.clientId,
        accountNumber: data.accountNumber,
        accountType: data.accountType,
        accountName: data.accountName,
        custodian: data.custodian,
        currentValue: data.currentValue || 0,
        inceptionDate: new Date(),
      },
    });

    await createAuditLog(req.user!.id, 'CREATE', 'account', account.id, { clientId: data.clientId }, req);
    res.status(201).json(account);
  })
);

// PUT /api/investments/accounts/:id
router.put(
  '/accounts/:id',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (req.user!.type === 'client') throw new ForbiddenError();

    const { accountName, currentValue, isActive } = req.body;
    const account = await prisma.account.update({
      where: { id: req.params.id },
      data: {
        ...(accountName && { accountName }),
        ...(currentValue !== undefined && { currentValue }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    await createAuditLog(req.user!.id, 'UPDATE', 'account', account.id, req.body, req);
    res.json(account);
  })
);

// ============================================
// HOLDINGS
// ============================================

// GET /api/investments/holdings/:accountId
router.get(
  '/holdings/:accountId',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const account = await prisma.account.findUnique({ where: { id: req.params.accountId } });
    if (!account) throw new NotFoundError('Account');
    if (req.user!.type === 'client' && account.clientId !== req.user!.id) throw new ForbiddenError();

    const holdings = await prisma.holding.findMany({
      where: { accountId: req.params.accountId },
      orderBy: { weight: 'desc' },
    });

    const allocationSummary = holdings.reduce((acc: Record<string, number>, h) => {
      acc[h.assetClass] = (acc[h.assetClass] || 0) + Number(h.weight);
      return acc;
    }, {});

    res.json({ holdings, allocation: allocationSummary });
  })
);

// ============================================
// TRANSACTIONS
// ============================================

// GET /api/investments/transactions
router.get(
  '/transactions',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { page, limit, sortOrder } = paginationSchema.parse(req.query);
    const accountId = qs(req.query.accountId);
    const clientId = qs(req.query.clientId);
    const type = qs(req.query.type);

    const where: any = {};
    if (accountId) where.accountId = accountId;
    if (type) where.type = type;

    if (req.user!.type === 'client') {
      where.account = { clientId: req.user!.id };
    } else if (clientId) {
      where.account = { clientId };
    }

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        include: { account: { select: { accountName: true, accountType: true, clientId: true } } },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { executedAt: sortOrder },
      }),
      prisma.transaction.count({ where }),
    ]);

    res.json({ data: transactions, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  })
);

// POST /api/investments/transactions
router.post(
  '/transactions',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (req.user!.type === 'client') throw new ForbiddenError();

    const data = createTransactionSchema.parse(req.body);

    const transaction = await prisma.transaction.create({
      data: {
        accountId: data.accountId,
        type: data.type,
        symbol: data.symbol,
        description: data.description,
        quantity: data.quantity,
        price: data.price,
        amount: data.amount,
        fees: data.fees || 0,
        executedAt: new Date(data.executedAt),
      },
    });

    await createAuditLog(req.user!.id, 'CREATE', 'transaction', transaction.id, { accountId: data.accountId, type: data.type }, req);
    res.status(201).json(transaction);
  })
);

// GET /api/investments/portfolio-summary/:clientId
router.get(
  '/portfolio-summary/:clientId',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { clientId } = req.params;
    if (req.user!.type === 'client' && req.user!.id !== clientId) throw new ForbiddenError();

    const accounts = await prisma.account.findMany({
      where: { clientId, isActive: true },
      include: { holdings: true },
    });

    const totalValue = accounts.reduce((sum, a) => sum + Number(a.currentValue), 0);
    const totalCostBasis = accounts.reduce((sum, a) => sum + Number(a.costBasis), 0);
    const totalGainLoss = totalValue - totalCostBasis;

    const allHoldings = accounts.flatMap((a) => a.holdings);
    const assetAllocation = allHoldings.reduce((acc: Record<string, number>, h) => {
      acc[h.assetClass] = (acc[h.assetClass] || 0) + Number(h.marketValue);
      return acc;
    }, {});

    const allocationPct = Object.fromEntries(
      Object.entries(assetAllocation).map(([k, v]) => [k, totalValue > 0 ? Number(((v / totalValue) * 100).toFixed(2)) : 0])
    );

    const topHoldings = allHoldings
      .sort((a, b) => Number(b.marketValue) - Number(a.marketValue))
      .slice(0, 10)
      .map((h) => ({
        symbol: h.symbol,
        name: h.name,
        marketValue: Number(h.marketValue),
        weight: Number(h.weight),
        gainLossPct: Number(h.gainLossPct),
      }));

    res.json({
      totalValue,
      totalCostBasis,
      totalGainLoss,
      gainLossPct: totalCostBasis > 0 ? Number(((totalGainLoss / totalCostBasis) * 100).toFixed(2)) : 0,
      accountCount: accounts.length,
      holdingsCount: allHoldings.length,
      assetAllocation: allocationPct,
      topHoldings,
      accounts: accounts.map((a) => ({
        id: a.id,
        name: a.accountName,
        type: a.accountType,
        value: Number(a.currentValue),
        ytdReturn: Number(a.ytdReturn),
      })),
    });
  })
);

export default router;
