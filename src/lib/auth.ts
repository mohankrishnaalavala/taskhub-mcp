/**
 * JWT Authentication service for HTTP transport (Phase 2.5)
 *
 * Provides JWT token generation, validation, and user context management.
 */

import jwt from 'jsonwebtoken';
import { config, derivedConfig } from '../config/env.js';
import { logger } from './logger.js';

export interface UserContext {
  userId: string;
  username: string;
  email?: string | undefined;
  roles?: string[] | undefined;
  permissions?: string[] | undefined;
  iat?: number | undefined;
  exp?: number | undefined;
}

export interface JwtPayload extends UserContext {
  iss: string; // issuer
  aud: string; // audience
  sub: string; // subject (user ID)
}

/**
 * Generate a JWT token for a user
 */
export function generateToken(user: UserContext): string {
  const payload: JwtPayload = {
    ...user,
    iss: 'taskhub-mcp',
    aud: 'taskhub-api',
    sub: user.userId,
  };

  const options: jwt.SignOptions = {
    expiresIn: `${config.JWT_TTL_MIN}m`,
    algorithm: 'HS256',
  };

  return jwt.sign(payload, config.JWT_SECRET, options);
}

/**
 * Generate a development/demo token for testing
 */
export function generateDemoToken(): string {
  return generateToken({
    userId: 'demo-user-1',
    username: 'demo-user',
    email: 'demo@taskhub.local',
    roles: ['developer', 'admin'],
    permissions: ['tasks:read', 'tasks:write', 'github:read', 'github:write'],
  });
}

/**
 * Verify and decode a JWT token
 */
export function verifyToken(token: string): UserContext {
  try {
    const decoded = jwt.verify(token, config.JWT_SECRET, {
      algorithms: ['HS256'],
      audience: 'taskhub-api',
      issuer: 'taskhub-mcp',
    }) as JwtPayload;

    return {
      userId: decoded.userId,
      username: decoded.username,
      email: decoded.email,
      roles: decoded.roles,
      permissions: decoded.permissions,
      iat: decoded.iat,
      exp: decoded.exp,
    };
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AuthenticationError('Token has expired', 'TOKEN_EXPIRED');
    } else if (error instanceof jwt.JsonWebTokenError) {
      throw new AuthenticationError('Invalid token', 'INVALID_TOKEN');
    } else {
      throw new AuthenticationError('Token verification failed', 'VERIFICATION_FAILED');
    }
  }
}

/**
 * Extract token from Authorization header
 */
export function extractTokenFromHeader(authHeader: string | undefined): string | null {
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1] || null;
}

/**
 * Check if a user has a specific permission
 */
export function hasPermission(user: UserContext, permission: string): boolean {
  if (!user.permissions) {
    return false;
  }

  return user.permissions.includes(permission) || user.permissions.includes('*');
}

/**
 * Check if a user has a specific role
 */
export function hasRole(user: UserContext, role: string): boolean {
  if (!user.roles) {
    return false;
  }

  return user.roles.includes(role) || user.roles.includes('admin');
}

/**
 * Create a user context for development/testing
 */
export function createDevelopmentUser(overrides: Partial<UserContext> = {}): UserContext {
  return {
    userId: 'dev-user-1',
    username: 'developer',
    email: 'dev@taskhub.local',
    roles: ['developer'],
    permissions: ['tasks:read', 'tasks:write', 'github:read', 'github:write'],
    ...overrides,
  };
}

/**
 * Create a user context for admin operations
 */
export function createAdminUser(overrides: Partial<UserContext> = {}): UserContext {
  return {
    userId: 'admin-user-1',
    username: 'admin',
    email: 'admin@taskhub.local',
    roles: ['admin'],
    permissions: ['*'],
    ...overrides,
  };
}

/**
 * Validate user permissions for specific operations
 */
export function validatePermissions(user: UserContext, operation: string): void {
  const permissionMap: Record<string, string[]> = {
    submit_spec: ['tasks:write'],
    list_tasks: ['tasks:read'],
    claim_task: ['tasks:write'],
    start_branch: ['github:write'],
    push_patch: ['github:write'],
    open_pr: ['github:write'],
    post_review: ['github:write'],
  };

  const requiredPermissions = permissionMap[operation];
  if (!requiredPermissions) {
    throw new AuthorizationError(`Unknown operation: ${operation}`, 'UNKNOWN_OPERATION');
  }

  const hasRequiredPermission = requiredPermissions.some(permission =>
    hasPermission(user, permission)
  );

  if (!hasRequiredPermission) {
    throw new AuthorizationError(
      `Insufficient permissions for operation: ${operation}. Required: ${requiredPermissions.join(' or ')}`,
      'INSUFFICIENT_PERMISSIONS'
    );
  }
}

/**
 * Generate a development token for testing
 */
export function generateDevelopmentToken(user?: Partial<UserContext>): string {
  if (!derivedConfig.isDevelopment) {
    throw new Error('Development tokens can only be generated in development mode');
  }

  const devUser = createDevelopmentUser(user);
  return generateToken(devUser);
}

/**
 * Refresh a token (generate new token with updated expiration)
 */
export function refreshToken(currentToken: string): string {
  const user = verifyToken(currentToken);

  // Remove JWT-specific fields before regenerating
  const { iat, exp, ...userContext } = user;

  return generateToken(userContext);
}

/**
 * Get token expiration time
 */
export function getTokenExpiration(token: string): Date | null {
  try {
    const decoded = jwt.decode(token) as JwtPayload;
    if (!decoded?.exp) {
      return null;
    }

    return new Date(decoded.exp * 1000);
  } catch {
    return null;
  }
}

/**
 * Check if token is expired
 */
export function isTokenExpired(token: string): boolean {
  const expiration = getTokenExpiration(token);
  if (!expiration) {
    return true;
  }

  return expiration < new Date();
}

/**
 * Authentication error class
 */
export class AuthenticationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 401
  ) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

/**
 * Authorization error class
 */
export class AuthorizationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 403
  ) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

/**
 * Log authentication events
 */
export function logAuthEvent(
  event: 'login' | 'logout' | 'token_refresh' | 'auth_failure',
  user: UserContext | null,
  details?: Record<string, any>
) {
  logger.info('Authentication event', {
    event,
    userId: user?.userId,
    username: user?.username,
    ...details,
  });
}
