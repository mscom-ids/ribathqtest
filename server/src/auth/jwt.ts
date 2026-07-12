import { createHash } from 'crypto';
import { SignJWT, jwtVerify } from 'jose';
import { config } from '../config';

const secret = new TextEncoder().encode(config.JWT_SECRET);

export type JwtRole = 'super_admin' | 'admin' | 'mentor' | 'parent';
export type TokenType = 'access' | 'refresh';

export interface TokenClaims {
  sub: string;
  tenant_id: string;
  role: JwtRole;
  type: TokenType;
}

export async function signAccessToken(claims: Omit<TokenClaims, 'type'>) {
  return new SignJWT({ tenant_id: claims.tenant_id, role: claims.role, type: 'access' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(config.JWT_ISSUER)
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${config.ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(secret);
}

export async function signRefreshToken(claims: Omit<TokenClaims, 'type'>) {
  return new SignJWT({ tenant_id: claims.tenant_id, role: claims.role, type: 'refresh' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(config.JWT_ISSUER)
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${config.REFRESH_TOKEN_TTL_DAYS}d`)
    .sign(secret);
}

export async function verifyToken(token: string, expectedType: TokenType): Promise<TokenClaims> {
  const { payload } = await jwtVerify(token, secret, { issuer: config.JWT_ISSUER });
  if (payload.type !== expectedType) throw new Error('Invalid token type');
  if (!payload.sub || !payload.tenant_id || !payload.role) throw new Error('Invalid token claims');
  return {
    sub: String(payload.sub),
    tenant_id: String(payload.tenant_id),
    role: payload.role as JwtRole,
    type: expectedType,
  };
}

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function refreshExpiryDate() {
  const date = new Date();
  date.setDate(date.getDate() + config.REFRESH_TOKEN_TTL_DAYS);
  return date;
}