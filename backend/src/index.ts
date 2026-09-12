import dotenv from 'dotenv';
dotenv.config();

import app from './app';
import { config } from './config';
import prisma from './config/prisma';

const PORT = config.port;

const startServer = async () => {
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔══════════════════════════════════════════════════════╗
║          Eminence HRIS Backend API v1.0.0            ║
╠══════════════════════════════════════════════════════╣
║  Status   : Running                                  ║
║  Port     : ${String(PORT).padEnd(36)}║
║  Env      : ${String(config.env).padEnd(36)}║
║  API Base : http://localhost:${PORT}/api/v1           ║
║  Health   : http://localhost:${PORT}/health           ║
╚══════════════════════════════════════════════════════╝
    `);
  });

  // Asymptotically connect DB without crashing process on startup
  prisma.$connect()
    .then(() => console.log('✅ Database connected successfully.'))
    .catch((err) => console.warn('⚠️ Initial DB connect notice (will retry on demand):', err.message));

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n🛑 Received ${signal}. Gracefully shutting down...`);
    server.close(async () => {
      await prisma.$disconnect();
      console.log('✅ Database disconnected. Bye!');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

startServer();
