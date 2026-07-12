import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ApiError } from '../lib/http';

export function errorHandler(error: FastifyError | ApiError, _request: FastifyRequest, reply: FastifyReply) {
  const statusCode = error instanceof ApiError ? error.statusCode : error.statusCode || 500;
  const code = error instanceof ApiError ? error.code : 'INTERNAL_ERROR';
  if (statusCode >= 500) console.error(error);
  reply.status(statusCode).send({
    success: false,
    code,
    error: statusCode >= 500 ? 'Internal server error' : error.message,
  });
}