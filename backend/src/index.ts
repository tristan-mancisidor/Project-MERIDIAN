import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import { env } from './config/environment';
import { connectDatabase, disconnectDatabase } from './config/database';
import { httpLogger, logger } from './middleware/logger';
import { errorHandler } from './middleware/errorHandler';

// Route imports
import authRoutes from './routes/auth';
import clientRoutes from './routes/clients';
import financialPlanRoutes from './routes/financial-plans';
import investmentRoutes from './routes/investments';
import documentRoutes from './routes/documents';
import messageRoutes from './routes/messages';
import taskRoutes from './routes/tasks';
import adminRoutes from './routes/admin';
import aiAgentRoutes from './routes/ai-agent';
import notificationRoutes from './routes/notifications';

const app = express();

// ============================================
// GLOBAL MIDDLEWARE
// ============================================
app.use(helmet());
app.use(cors({
  origin: env.cors.origin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(httpLogger);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: env.isDev ? 1000 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api/', limiter);

// Stricter rate limit for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.isDev ? 100 : 10,
  message: { error: 'Too many authentication attempts, please try again later.' },
});
app.use('/api/auth/login', authLimiter);

// Static file serving for uploads
app.use('/uploads', express.static('uploads'));

// ============================================
// API ROUTES
// ============================================
app.use('/api/auth', authRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/financial-plans', financialPlanRoutes);
app.use('/api/investments', investmentRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/ai', aiAgentRoutes);
app.use('/api/notifications', notificationRoutes);

// ============================================
// HEALTH CHECK
// ============================================
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'Meridian Wealth Advisors API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: env.nodeEnv,
  });
});

// API info endpoint
app.get('/api', (_req, res) => {
  res.json({
    name: 'Meridian Wealth Advisors API',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      auth: '/api/auth',
      clients: '/api/clients',
      financialPlans: '/api/financial-plans',
      investments: '/api/investments',
      documents: '/api/documents',
      messages: '/api/messages',
      tasks: '/api/tasks',
      admin: '/api/admin',
      ai: '/api/ai',
      notifications: '/api/notifications',
    },
  });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Global error handler
app.use(errorHandler);

// ============================================
// SERVER STARTUP
// ============================================
async function startServer() {
  try {
    await connectDatabase();

    // Create uploads directory if it doesn't exist
    const fs = await import('fs');
    const uploadDir = 'uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    app.listen(env.port, () => {
      logger.info(`
╔══════════════════════════════════════════════════╗
║   Meridian Wealth Advisors API Server            ║
║   Running on: http://localhost:${env.port}              ║
║   Environment: ${env.nodeEnv.padEnd(33)}║
║   Database: Connected                            ║
╚══════════════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  await disconnectDatabase();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received. Shutting down...');
  await disconnectDatabase();
  process.exit(0);
});

startServer();

export default app;
