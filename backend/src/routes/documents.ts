import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { authenticate, createAuditLog } from '../middleware/auth';
import { AuthenticatedRequest, qs } from '../types';
import { prisma } from '../config/database';
import { createDocumentSchema, paginationSchema } from '../middleware/validation';
import { asyncHandler, NotFoundError, ForbiddenError, ValidationError } from '../middleware/errorHandler';

const router = Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, path.join(__dirname, '../../uploads')),
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB max
  fileFilter: (_req, file, cb) => {
    const allowed = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.png', '.jpg', '.jpeg'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${ext} not allowed`));
    }
  },
});

// GET /api/documents - List documents
router.get(
  '/',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { page, limit, sortOrder } = paginationSchema.parse(req.query);
    const clientId = qs(req.query.clientId);
    const type = qs(req.query.type);
    const category = qs(req.query.category);

    const where: any = { isArchived: false };
    if (type) where.type = type;
    if (category) where.category = category;

    if (req.user!.type === 'client') {
      where.clientId = req.user!.id;
    } else if (clientId) {
      where.clientId = clientId;
    }

    const [documents, total] = await Promise.all([
      prisma.document.findMany({
        where,
        include: { client: { select: { id: true, firstName: true, lastName: true } } },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: sortOrder },
      }),
      prisma.document.count({ where }),
    ]);

    res.json({ data: documents, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  })
);

// GET /api/documents/:id
router.get(
  '/:id',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const doc = await prisma.document.findUnique({
      where: { id: req.params.id },
      include: { client: { select: { id: true, firstName: true, lastName: true } } },
    });
    if (!doc) throw new NotFoundError('Document');

    if (req.user!.type === 'client' && doc.clientId !== req.user!.id) throw new ForbiddenError();

    res.json(doc);
  })
);

// POST /api/documents - Upload a document
router.post(
  '/',
  authenticate,
  upload.single('file'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const metadata = createDocumentSchema.parse(req.body);

    const fileUrl = req.file
      ? `/uploads/${req.file.filename}`
      : req.body.fileUrl;

    if (!fileUrl) throw new ValidationError('File or fileUrl is required');

    const document = await prisma.document.create({
      data: {
        clientId: metadata.clientId,
        name: metadata.name,
        type: metadata.type,
        category: metadata.category,
        description: metadata.description,
        fileUrl,
        fileSize: req.file?.size,
        mimeType: req.file?.mimetype,
        uploadedBy: req.user!.id,
      },
    });

    // Create notification for client
    await prisma.notification.create({
      data: {
        clientId: metadata.clientId,
        type: 'DOCUMENT_READY',
        title: 'New Document Available',
        message: `A new document "${metadata.name}" has been uploaded to your account.`,
        actionUrl: `/documents/${document.id}`,
      },
    });

    await createAuditLog(req.user!.id, 'UPLOAD', 'document', document.id, { clientId: metadata.clientId, name: metadata.name }, req);
    res.status(201).json(document);
  })
);

// PUT /api/documents/:id
router.put(
  '/:id',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (req.user!.type === 'client') throw new ForbiddenError();

    const { name, description, category, isArchived } = req.body;
    const document = await prisma.document.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(category && { category }),
        ...(isArchived !== undefined && { isArchived }),
      },
    });

    await createAuditLog(req.user!.id, 'UPDATE', 'document', document.id, req.body, req);
    res.json(document);
  })
);

// DELETE /api/documents/:id - Soft delete (archive)
router.delete(
  '/:id',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (req.user!.type === 'client') throw new ForbiddenError();

    await prisma.document.update({
      where: { id: req.params.id },
      data: { isArchived: true },
    });

    await createAuditLog(req.user!.id, 'ARCHIVE', 'document', req.params.id, null, req);
    res.json({ message: 'Document archived' });
  })
);

export default router;
