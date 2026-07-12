import type { FastifyRequest } from 'fastify';
import { ApiError } from '../lib/http';
import type { JwtRole } from './jwt';

export function assertRole(request: FastifyRequest, roles: JwtRole[]) {
  if (!roles.includes(request.user.role)) throw new ApiError(403, 'Forbidden', 'FORBIDDEN');
}

export function isAdminRole(role: JwtRole) {
  return role === 'super_admin' || role === 'admin';
}