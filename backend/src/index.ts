import dotenv from 'dotenv';
dotenv.config();

import app from './app';
import { config } from './config';
import prisma from './config/prisma';

const PORT = config.port;

const startServer = async () => {
  // Do not advertise a healthy production service until its database is reachable.
  try {
    await prisma.$connect();
    console.log('✅ Database connected successfully.');
  } catch (error) {
    console.error('❌ Database connection failed during startup.', error);
    process.exitCode = 1;
    return;
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
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
