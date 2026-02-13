import { Router, Response } from 'express';
import { authenticate, createAuditLog } from '../middleware/auth';
import { AuthenticatedRequest, qs } from '../types';
import { prisma } from '../config/database';
import { createTaskSchema, updateTaskSchema, createMeetingSchema, paginationSchema } from '../middleware/validation';
import { asyncHandler, NotFoundError, ForbiddenError } from '../middleware/errorHandler';

const router = Router();

// ============================================
// TASKS
// ============================================

// GET /api/tasks - List tasks
router.get(
  '/',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { page, limit, sortOrder } = paginationSchema.parse(req.query);
    const clientId = qs(req.query.clientId);
    const status = qs(req.query.status);
    const priority = qs(req.query.priority);
    const assigneeId = qs(req.query.assigneeId);
    const category = qs(req.query.category);

    const where: any = {};
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (category) where.category = category;
    if (assigneeId) where.assigneeId = assigneeId;

    if (req.user!.type === 'client') {
      where.clientId = req.user!.id;
    } else if (clientId) {
      where.clientId = clientId;
    }

    // Advisors see tasks assigned to them or their clients
    if (req.user!.role === 'ADVISOR') {
      where.OR = [
        { assigneeId: req.user!.id },
        { client: { advisorId: req.user!.id } },
      ];
    }

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        include: {
          client: { select: { id: true, firstName: true, lastName: true } },
          assignee: { select: { id: true, firstName: true, lastName: true } },
          creator: { select: { id: true, firstName: true, lastName: true } },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ priority: 'asc' }, { dueDate: 'asc' }],
      }),
      prisma.task.count({ where }),
    ]);

    res.json({ data: tasks, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  })
);

// GET /api/tasks/:id
router.get(
  '/:id',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const task = await prisma.task.findUnique({
      where: { id: req.params.id },
      include: {
        client: { select: { id: true, firstName: true, lastName: true } },
        assignee: { select: { id: true, firstName: true, lastName: true } },
        creator: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!task) throw new NotFoundError('Task');

    if (req.user!.type === 'client' && task.clientId !== req.user!.id) throw new ForbiddenError();

    res.json(task);
  })
);

// POST /api/tasks
router.post(
  '/',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const data = createTaskSchema.parse(req.body);

    const task = await prisma.task.create({
      data: {
        clientId: data.clientId,
        assigneeId: data.assigneeId,
        creatorId: req.user!.type === 'user' ? req.user!.id : null,
        title: data.title,
        description: data.description,
        priority: data.priority || 'MEDIUM',
        category: data.category,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
      },
      include: {
        client: { select: { id: true, firstName: true, lastName: true } },
        assignee: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // Notify client if task is assigned to them
    if (data.clientId) {
      await prisma.notification.create({
        data: {
          clientId: data.clientId,
          type: 'TASK_ASSIGNED',
          title: 'New Action Item',
          message: `New task: "${data.title}"`,
          actionUrl: `/tasks/${task.id}`,
        },
      });
    }

    await createAuditLog(req.user!.id, 'CREATE', 'task', task.id, data, req);
    res.status(201).json(task);
  })
);

// PUT /api/tasks/:id
router.put(
  '/:id',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const data = updateTaskSchema.parse(req.body);

    const task = await prisma.task.update({
      where: { id: req.params.id },
      data: {
        ...data,
        ...(data.dueDate && { dueDate: new Date(data.dueDate) }),
        ...(data.status === 'COMPLETED' && { completedAt: new Date() }),
      },
      include: {
        client: { select: { id: true, firstName: true, lastName: true } },
        assignee: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    await createAuditLog(req.user!.id, 'UPDATE', 'task', task.id, data, req);
    res.json(task);
  })
);

// DELETE /api/tasks/:id
router.delete(
  '/:id',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (req.user!.type === 'client') throw new ForbiddenError();

    await prisma.task.update({
      where: { id: req.params.id },
      data: { status: 'CANCELLED' },
    });

    await createAuditLog(req.user!.id, 'CANCEL', 'task', req.params.id, null, req);
    res.json({ message: 'Task cancelled' });
  })
);

// ============================================
// MEETINGS
// ============================================

// GET /api/tasks/meetings/list
router.get(
  '/meetings/list',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const clientId2 = qs(req.query.clientId);
    const status2 = qs(req.query.status);
    const where: any = {};
    if (status2) where.status = status2;

    if (req.user!.type === 'client') {
      where.clientId = req.user!.id;
    } else if (clientId2) {
      where.clientId = clientId2;
    } else if (req.user!.role === 'ADVISOR') {
      where.advisorId = req.user!.id;
    }

    const meetings = await prisma.meeting.findMany({
      where,
      include: {
        client: { select: { id: true, firstName: true, lastName: true } },
        advisor: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { startTime: 'asc' },
    });

    res.json(meetings);
  })
);

// POST /api/tasks/meetings
router.post(
  '/meetings',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const data = createMeetingSchema.parse(req.body);

    const meeting = await prisma.meeting.create({
      data: {
        clientId: data.clientId,
        advisorId: data.advisorId,
        title: data.title,
        description: data.description,
        type: data.type || 'REVIEW',
        startTime: new Date(data.startTime),
        endTime: new Date(data.endTime),
        location: data.location,
      },
      include: {
        client: { select: { id: true, firstName: true, lastName: true } },
        advisor: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // Notify client
    await prisma.notification.create({
      data: {
        clientId: data.clientId,
        type: 'MEETING_REMINDER',
        title: 'Meeting Scheduled',
        message: `${data.title} scheduled for ${new Date(data.startTime).toLocaleDateString()}.`,
        actionUrl: `/meetings/${meeting.id}`,
      },
    });

    await createAuditLog(req.user!.id, 'CREATE', 'meeting', meeting.id, data, req);
    res.status(201).json(meeting);
  })
);

// PUT /api/tasks/meetings/:id
router.put(
  '/meetings/:id',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { status, notes, location, startTime, endTime } = req.body;

    const meeting = await prisma.meeting.update({
      where: { id: req.params.id },
      data: {
        ...(status && { status }),
        ...(notes !== undefined && { notes }),
        ...(location && { location }),
        ...(startTime && { startTime: new Date(startTime) }),
        ...(endTime && { endTime: new Date(endTime) }),
      },
    });

    res.json(meeting);
  })
);

// GET /api/tasks/notifications
router.get(
  '/notifications/list',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (req.user!.type !== 'client') throw new ForbiddenError('Client access required');

    const notifications = await prisma.notification.findMany({
      where: { clientId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.json(notifications);
  })
);

// PUT /api/tasks/notifications/:id/read
router.put(
  '/notifications/:id/read',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    await prisma.notification.update({
      where: { id: req.params.id },
      data: { isRead: true },
    });
    res.json({ message: 'Notification marked as read' });
  })
);

export default router;
