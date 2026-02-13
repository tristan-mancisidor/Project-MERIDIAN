import { Router, Response } from 'express';
import {
  hashPassword,
  comparePassword,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  authenticate,
  createAuditLog,
  JwtPayload,
} from '../middleware/auth';
import { AuthenticatedRequest } from '../types';
import { prisma } from '../config/database';
import { loginSchema, registerUserSchema, registerClientSchema } from '../middleware/validation';
import { asyncHandler, NotFoundError, UnauthorizedError, ConflictError } from '../middleware/errorHandler';

const router = Router();

// POST /api/auth/login - Unified login for users and clients
router.post(
  '/login',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { email, password } = loginSchema.parse(req.body);

    // Try user first, then client
    let payload: JwtPayload | null = null;

    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      const valid = await comparePassword(password, user.passwordHash);
      if (!valid) throw new UnauthorizedError('Invalid credentials');
      if (!user.isActive) throw new UnauthorizedError('Account is deactivated');

      payload = { id: user.id, email: user.email, role: user.role, type: 'user' };
      await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    } else {
      const client = await prisma.client.findUnique({ where: { email } });
      if (!client) throw new UnauthorizedError('Invalid credentials');

      const valid = await comparePassword(password, client.passwordHash);
      if (!valid) throw new UnauthorizedError('Invalid credentials');
      if (!client.isActive) throw new UnauthorizedError('Account is deactivated');

      payload = { id: client.id, email: client.email, role: 'CLIENT', type: 'client' };
    }

    const accessToken = generateAccessToken(payload!);
    const refreshToken = generateRefreshToken(payload!);

    await createAuditLog(payload!.id, 'LOGIN', payload!.type, payload!.id, null, req);

    res.json({
      accessToken,
      refreshToken,
      user: { id: payload!.id, email: payload!.email, role: payload!.role, type: payload!.type },
    });
  })
);

// POST /api/auth/register/user - Register a staff user (admin only)
router.post(
  '/register/user',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (req.user?.role !== 'ADMIN') {
      throw new UnauthorizedError('Admin access required');
    }

    const data = registerUserSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) throw new ConflictError('Email already registered');

    const passwordHash = await hashPassword(data.password);
    const user = await prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        role: (data.role as any) || 'ADVISOR',
      },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, createdAt: true },
    });

    await createAuditLog(req.user.id, 'CREATE', 'user', user.id, { email: user.email }, req);

    res.status(201).json(user);
  })
);

// POST /api/auth/register/client - Register a client
router.post(
  '/register/client',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const data = registerClientSchema.parse(req.body);
    const existing = await prisma.client.findUnique({ where: { email: data.email } });
    if (existing) throw new ConflictError('Email already registered');

    const passwordHash = await hashPassword(data.password);
    const client = await prisma.client.create({
      data: {
        email: data.email,
        passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        serviceTier: (data.serviceTier as any) || 'ESSENTIAL',
        status: 'PROSPECT',
        profile: { create: {} },
      },
      select: { id: true, email: true, firstName: true, lastName: true, status: true, serviceTier: true, createdAt: true },
    });

    await createAuditLog(null, 'CREATE', 'client', client.id, { email: client.email }, req);

    res.status(201).json(client);
  })
);

// POST /api/auth/refresh - Refresh access token
router.post(
  '/refresh',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { refreshToken } = req.body;
    if (!refreshToken) throw new UnauthorizedError('Refresh token required');

    const payload = verifyRefreshToken(refreshToken);
    const newPayload: JwtPayload = { id: payload.id, email: payload.email, role: payload.role, type: payload.type };
    const accessToken = generateAccessToken(newPayload);

    res.json({ accessToken });
  })
);

// GET /api/auth/me - Get current user profile
router.get(
  '/me',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (req.user!.type === 'user') {
      const user = await prisma.user.findUnique({
        where: { id: req.user!.id },
        select: { id: true, email: true, firstName: true, lastName: true, role: true, lastLoginAt: true, createdAt: true },
      });
      if (!user) throw new NotFoundError('User');
      res.json({ ...user, type: 'user' });
    } else {
      const client = await prisma.client.findUnique({
        where: { id: req.user!.id },
        include: { profile: true, advisor: { select: { id: true, firstName: true, lastName: true, email: true } } },
      });
      if (!client) throw new NotFoundError('Client');
      const { passwordHash, ...clientData } = client;
      res.json({ ...clientData, type: 'client' });
    }
  })
);

// PUT /api/auth/password - Change password
router.put(
  '/password',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword || newPassword.length < 8) {
      throw new UnauthorizedError('Valid current and new password required (min 8 chars)');
    }

    if (req.user!.type === 'user') {
      const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
      if (!user || !(await comparePassword(currentPassword, user.passwordHash))) {
        throw new UnauthorizedError('Invalid current password');
      }
      await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(newPassword) } });
    } else {
      const client = await prisma.client.findUnique({ where: { id: req.user!.id } });
      if (!client || !(await comparePassword(currentPassword, client.passwordHash))) {
        throw new UnauthorizedError('Invalid current password');
      }
      await prisma.client.update({ where: { id: client.id }, data: { passwordHash: await hashPassword(newPassword) } });
    }

    await createAuditLog(req.user!.id, 'PASSWORD_CHANGE', req.user!.type, req.user!.id, null, req);
    res.json({ message: 'Password updated successfully' });
  })
);

export default router;
