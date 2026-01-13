import Fastify from 'fastify';
import cors from '@fastify/cors';
import { ensureStorageDirectories } from '../utils/storage.js';

export async function createServer() {
  const server = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
        },
      },
    },
  });

  await server.register(cors, {
    origin: true,
    credentials: true,
  });

  server.setErrorHandler((error, request, reply) => {
    server.log.error(error);

    const statusCode = (error as any).statusCode || 500;
    const message = (error as any).message || 'Internal Server Error';

    reply.status(statusCode).send({
      error: true,
      message,
      statusCode,
    });
  });

  server.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      error: true,
      message: 'Not Found',
      statusCode: 404,
    });
  });

  await ensureStorageDirectories();

  return server;
}
