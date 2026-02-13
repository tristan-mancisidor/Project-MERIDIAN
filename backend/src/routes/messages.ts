import { Router, Response } from 'express';
import { authenticate, createAuditLog } from '../middleware/auth';
import { AuthenticatedRequest, qs } from '../types';
import { prisma } from '../config/database';
import { createConversationSchema, sendMessageSchema, paginationSchema } from '../middleware/validation';
import { asyncHandler, NotFoundError, ForbiddenError } from '../middleware/errorHandler';

const router = Router();

// ============================================
// CONVERSATIONS
// ============================================

// GET /api/messages/conversations - List conversations
router.get(
  '/conversations',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { page, limit } = paginationSchema.parse(req.query);
    const clientId = qs(req.query.clientId);
    const status = qs(req.query.status);

    const where: any = {};
    if (status) where.status = status;

    if (req.user!.type === 'client') {
      where.clientId = req.user!.id;
    } else if (clientId) {
      where.clientId = clientId;
    }

    const [conversations, total] = await Promise.all([
      prisma.conversation.findMany({
        where,
        include: {
          client: { select: { id: true, firstName: true, lastName: true } },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { content: true, senderType: true, createdAt: true, isRead: true },
          },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.conversation.count({ where }),
    ]);

    // Add unread count
    const enriched = await Promise.all(
      conversations.map(async (conv) => {
        const unreadCount = await prisma.message.count({
          where: {
            conversationId: conv.id,
            isRead: false,
            senderType: req.user!.type === 'client' ? { not: 'CLIENT' } : 'CLIENT',
          },
        });
        return { ...conv, unreadCount };
      })
    );

    res.json({ data: enriched, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  })
);

// POST /api/messages/conversations - Create a conversation
router.post(
  '/conversations',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const data = createConversationSchema.parse(req.body);

    // Clients can only create conversations for themselves
    const clientId = req.user!.type === 'client' ? req.user!.id : data.clientId;

    const conversation = await prisma.conversation.create({
      data: {
        clientId,
        subject: data.subject,
        channel: data.channel || 'portal',
      },
      include: { client: { select: { id: true, firstName: true, lastName: true } } },
    });

    res.status(201).json(conversation);
  })
);

// GET /api/messages/conversations/:id - Get conversation with messages
router.get(
  '/conversations/:id',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const conversation = await prisma.conversation.findUnique({
      where: { id: req.params.id },
      include: {
        client: { select: { id: true, firstName: true, lastName: true } },
        messages: {
          orderBy: { createdAt: 'asc' },
          include: { sender: { select: { id: true, firstName: true, lastName: true } } },
        },
      },
    });

    if (!conversation) throw new NotFoundError('Conversation');
    if (req.user!.type === 'client' && conversation.clientId !== req.user!.id) throw new ForbiddenError();

    // Mark messages as read
    const senderTypeToMark = req.user!.type === 'client' ? { not: 'CLIENT' as const } : ('CLIENT' as const);
    await prisma.message.updateMany({
      where: { conversationId: req.params.id, isRead: false, senderType: senderTypeToMark },
      data: { isRead: true },
    });

    res.json(conversation);
  })
);

// PUT /api/messages/conversations/:id - Update conversation status
router.put(
  '/conversations/:id',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { status } = req.body;

    const conversation = await prisma.conversation.update({
      where: { id: req.params.id },
      data: { status },
    });

    res.json(conversation);
  })
);

// ============================================
// MESSAGES
// ============================================

// POST /api/messages - Send a message
router.post(
  '/',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const data = sendMessageSchema.parse(req.body);

    const conversation = await prisma.conversation.findUnique({ where: { id: data.conversationId } });
    if (!conversation) throw new NotFoundError('Conversation');
    if (req.user!.type === 'client' && conversation.clientId !== req.user!.id) throw new ForbiddenError();

    const senderType = req.user!.type === 'client' ? 'CLIENT' : data.senderType;

    const message = await prisma.message.create({
      data: {
        conversationId: data.conversationId,
        senderId: senderType === 'SYSTEM' || senderType === 'AI_AGENT' ? null : req.user!.id,
        senderType: senderType as any,
        content: data.content,
      },
      include: { sender: { select: { id: true, firstName: true, lastName: true } } },
    });

    // Update conversation timestamp
    await prisma.conversation.update({
      where: { id: data.conversationId },
      data: { status: 'OPEN' },
    });

    // Notify the other party
    if (senderType !== 'SYSTEM') {
      if (req.user!.type !== 'client') {
        await prisma.notification.create({
          data: {
            clientId: conversation.clientId,
            type: 'MESSAGE_RECEIVED',
            title: 'New Message',
            message: `You have a new message in "${conversation.subject}".`,
            actionUrl: `/messages/${conversation.id}`,
          },
        });
      }
    }

    res.status(201).json(message);
  })
);

// GET /api/messages/unread-count - Get unread message count
router.get(
  '/unread-count',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    let where: any;

    if (req.user!.type === 'client') {
      where = {
        conversation: { clientId: req.user!.id },
        isRead: false,
        senderType: { not: 'CLIENT' },
      };
    } else {
      where = {
        isRead: false,
        senderType: 'CLIENT',
        ...(req.user!.role === 'ADVISOR' && {
          conversation: { client: { advisorId: req.user!.id } },
        }),
      };
    }

    const count = await prisma.message.count({ where });
    res.json({ unreadCount: count });
  })
);

export default router;
