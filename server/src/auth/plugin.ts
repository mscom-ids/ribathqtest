import fp from 'fastify-plugin';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { verifyToken, type JwtRole } from './jwt';
import { ApiError } from '../lib/http';

declare module 'fastify' {
  interface FastifyRequest {
    user: {
      id: string;
      tenantId: string;
      role: JwtRole;
    };
  }

  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole: (roles: JwtRole[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export const authPlugin = fp(async (app) => {
  app.decorate('authenticate', async (request: FastifyRequest) => {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new ApiError(401, 'Missing bearer token', 'UNAUTHENTICATED');
    try {
      const claims = await verifyToken(header.slice('Bearer '.length), 'access');
      request.user = { id: claims.sub, tenantId: claims.tenant_id, role: claims.role };
    } catch {
      throw new ApiError(401, 'Invalid or expired token', 'UNAUTHENTICATED');
    }
  });

  app.decorate('requireRole', (roles: JwtRole[]) => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      await app.authenticate(request, reply);
      if (!roles.includes(request.user.role)) throw new ApiError(403, 'Forbidden', 'FORBIDDEN');
    };
  });
});