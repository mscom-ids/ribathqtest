import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodError, type ZodSchema } from 'zod';

export class ApiError extends Error {
  constructor(public statusCode: number, message: string, public code = 'API_ERROR') {
    super(message);
  }
}

export function parseBody<T>(schema: ZodSchema<T>, request: FastifyRequest): T {
  const result = schema.safeParse(request.body);
  if (!result.success) throw new ApiError(400, formatZodError(result.error), 'VALIDATION_ERROR');
  return result.data;
}

export function parseParams<T>(schema: ZodSchema<T>, request: FastifyRequest): T {
  const result = schema.safeParse(request.params);
  if (!result.success) throw new ApiError(400, formatZodError(result.error), 'VALIDATION_ERROR');
  return result.data;
}

export function parseQuery<T>(schema: ZodSchema<T>, request: FastifyRequest): T {
  const result = schema.safeParse(request.query);
  if (!result.success) throw new ApiError(400, formatZodError(result.error), 'VALIDATION_ERROR');
  return result.data;
}

export function ok(reply: FastifyReply, data: unknown = {}) {
  return reply.send({ success: true, ...data });
}

function formatZodError(error: ZodError) {
  return error.issues.map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`).join('; ');
}