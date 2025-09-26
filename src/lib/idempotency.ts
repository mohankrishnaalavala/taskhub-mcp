/**
 * Idempotency service for HTTP requests (Phase 2.5)
 *
 * Implements idempotency keys to ensure safe retries and prevent duplicate operations.
 * Based on the Stripe idempotency pattern.
 */

import { createHash } from 'crypto';
import { prisma } from './database.js';
import { logger } from './logger.js';

export interface IdempotencyRequest {
  key: string;
  method: string;
  path: string;
  userId?: string | undefined;
  body: any;
}

export interface IdempotencyResponse {
  response: any;
  statusCode: number;
  isReplay: boolean;
}

export interface StoredResponse {
  response: any;
  statusCode: number;
  createdAt: string;
}

/**
 * Generate a hash of the request body for comparison
 */
function hashRequestBody(body: any): string {
  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
  return createHash('sha256').update(bodyStr).digest('hex');
}

/**
 * Generate expiration time for idempotency keys
 */
function getExpirationTime(): Date {
  // Idempotency keys expire after 24 hours
  const expirationMs = 24 * 60 * 60 * 1000;
  return new Date(Date.now() + expirationMs);
}

/**
 * Check if an idempotency key exists and return the stored response
 */
export async function checkIdempotencyKey(
  request: IdempotencyRequest
): Promise<IdempotencyResponse | null> {
  try {
    const requestHash = hashRequestBody(request.body);

    // Look for existing idempotency key
    const existing = await prisma.idempotencyKey.findUnique({
      where: { id: request.key },
    });

    if (!existing) {
      return null; // No existing key found
    }

    // Check if key has expired
    if (existing.expiresAt < new Date()) {
      // Clean up expired key
      await prisma.idempotencyKey.delete({
        where: { id: request.key },
      });

      logger.debug('Expired idempotency key cleaned up', {
        key: request.key,
        expiredAt: existing.expiresAt,
      });

      return null;
    }

    // Verify request consistency
    if (existing.method !== request.method || existing.path !== request.path) {
      throw new Error(
        `Idempotency key conflict: method/path mismatch. ` +
          `Expected ${existing.method} ${existing.path}, ` +
          `got ${request.method} ${request.path}`
      );
    }

    // Verify user consistency (if applicable)
    if (existing.userId !== request.userId) {
      throw new Error(
        `Idempotency key conflict: user mismatch. ` +
          `Expected ${existing.userId}, got ${request.userId}`
      );
    }

    // Verify request body consistency
    if (existing.requestHash !== requestHash) {
      throw new Error(
        'Idempotency key conflict: request body has changed. ' +
          'The same idempotency key cannot be used with different request data.'
      );
    }

    // Parse and return stored response
    const storedResponse: StoredResponse = JSON.parse(existing.response);

    logger.info('Idempotency key replay', {
      key: request.key,
      method: request.method,
      path: request.path,
      userId: request.userId,
      statusCode: existing.statusCode,
      originalCreatedAt: storedResponse.createdAt,
    });

    return {
      response: storedResponse.response,
      statusCode: existing.statusCode,
      isReplay: true,
    };
  } catch (error) {
    logger.error('Error checking idempotency key', {
      key: request.key,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Store a response for an idempotency key
 */
export async function storeIdempotencyResponse(
  request: IdempotencyRequest,
  response: any,
  statusCode: number
): Promise<void> {
  try {
    const requestHash = hashRequestBody(request.body);
    const expiresAt = getExpirationTime();

    const storedResponse: StoredResponse = {
      response,
      statusCode,
      createdAt: new Date().toISOString(),
    };

    await prisma.idempotencyKey.create({
      data: {
        id: request.key,
        method: request.method,
        path: request.path,
        userId: request.userId ?? null,
        requestHash,
        response: JSON.stringify(storedResponse),
        statusCode,
        expiresAt,
      },
    });

    logger.debug('Idempotency key stored', {
      key: request.key,
      method: request.method,
      path: request.path,
      userId: request.userId,
      statusCode,
      expiresAt,
    });
  } catch (error) {
    // If storing fails, log but don't throw - the operation succeeded
    logger.error('Error storing idempotency key', {
      key: request.key,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Clean up expired idempotency keys (should be run periodically)
 */
export async function cleanupExpiredKeys(): Promise<number> {
  try {
    const result = await prisma.idempotencyKey.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });

    if (result.count > 0) {
      logger.info('Cleaned up expired idempotency keys', {
        count: result.count,
      });
    }

    return result.count;
  } catch (error) {
    logger.error('Error cleaning up expired idempotency keys', {
      error: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
}

/**
 * Validate idempotency key format
 */
export function validateIdempotencyKey(key: string): boolean {
  // Key should be a non-empty string, typically a UUID or similar
  if (!key || typeof key !== 'string') {
    return false;
  }

  // Key should be reasonable length (not too short or too long)
  if (key.length < 8 || key.length > 255) {
    return false;
  }

  // Key should contain only safe characters
  const safeKeyPattern = /^[a-zA-Z0-9\-_]+$/;
  return safeKeyPattern.test(key);
}

/**
 * Generate a suggested idempotency key format
 */
export function generateIdempotencyKey(prefix: string = 'taskhub'): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  return `${prefix}-${timestamp}-${random}`;
}

/**
 * Error class for idempotency conflicts
 */
export class IdempotencyConflictError extends Error {
  constructor(
    message: string,
    public readonly key: string
  ) {
    super(message);
    this.name = 'IdempotencyConflictError';
  }
}
