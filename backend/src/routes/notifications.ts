import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';
import { prisma } from '../config/database';
import { paginationSchema } from '../middleware/validation';
import { asyncHandler, NotFoundError } from '../middleware/errorHandler';

const router = Router();

// GET /api/notifications - List notifications for current user
router.get(
  '/',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { page, limit, sortOrder } = paginationSchema.parse(req.query);

    const where: any = {};
    if (req.user!.type === 'client') {
      where.clientId = req.user!.id;
    }

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: sortOrder },
      }),
      prisma.notification.count({ where }),
    ]);

    res.json({
      data: notifications,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  })
);

// GET /api/notifications/:id
router.get(
  '/:id',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const notification = await prisma.notification.findUnique({
      where: { id: req.params.id },
    });
    if (!notification) throw new NotFoundError('Notification');
    if (req.user!.type === 'client' && notification.clientId !== req.user!.id) {
      throw new NotFoundError('Notification');
    }
    res.json(notification);
  })
);

// PUT /api/notifications/:id/read - Mark single notification as read
router.put(
  '/:id/read',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const notification = await prisma.notification.update({
      where: { id: req.params.id },
      data: { isRead: true },
    });
    res.json(notification);
  })
);

// PUT /api/notifications/read-all - Mark all notifications as read
router.put(
  '/read-all',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const where: any = { isRead: false };
    if (req.user!.type === 'client') {
      where.clientId = req.user!.id;
    }

    const result = await prisma.notification.updateMany({
      where,
      data: { isRead: true },
    });

    res.json({ message: 'All notifications marked as read', count: result.count });
  })
);

export default router;
