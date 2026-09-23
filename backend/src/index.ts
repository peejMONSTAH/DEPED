import dotenv from 'dotenv';
dotenv.config();

import app from './app';
import { config } from './config';
import prisma from './config/prisma';
import { logger } from './utils/logger';
import { startWorkflowOutboxWorker } from './services/workflow-outbox.service';

const PORT = config.port;

// Keep the existing global failure logging for unrelated background jobs.
// OCR itself now uses bounded child processes and catches failures per request.
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled promise rejection (process kept alive)');
});
process.on('uncaughtException', (error) => {
  logger.error({ err: error }, 'Uncaught exception (process kept alive)');
});

const startServer = async () => {
  // Do not advertise a healthy production service until its database is reachable.
  try {
    await prisma.$connect();
    logger.info('✅ Database connected successfully.');
  } catch (error) {
    logger.error({ err: error }, '❌ Database connection failed during startup.');
    process.exitCode = 1;
    return;
  }

  const server = app.listen(PORT, process.env.API_HOST || '0.0.0.0', () => {
    console.log(`
╔══════════════════════════════════════════════════════╗
║          Digital 201 Backend API v1.0.0            ║
╠══════════════════════════════════════════════════════╣
║  Status   : Running                                  ║
║  Port     : ${String(PORT).padEnd(36)}║
║  Env      : ${String(config.env).padEnd(36)}║
║  API Base : http://localhost:${PORT}/api/v1           ║
║  Health   : http://localhost:${PORT}/health           ║
╚══════════════════════════════════════════════════════╝
    `);
  });
  // A restore drill must never deliver queued emails copied from production.
  const outboxTimer = process.env.WORKFLOW_OUTBOX_ENABLED === 'false' ? null : startWorkflowOutboxWorker();

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info('\n🛑 Received ${signal}. Gracefully shutting down...');
    if (outboxTimer) clearInterval(outboxTimer);
    server.close(async () => {
      await prisma.$disconnect();
      logger.info('✅ Database disconnected. Bye!');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

startServer();
