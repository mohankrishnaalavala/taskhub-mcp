import { PrismaClient } from '@prisma/client';
import { logger } from './logger.js';
import { config } from '../config/env.js';
import { DatabaseError, Result, success, failure } from '../types/errors.js';

// Create Prisma client instance
const prisma = new PrismaClient({
  log: config.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
  datasources: {
    db: {
      url: config.DATABASE_URL,
    },
  },
});

// Database connection management
let isConnected = false;

/**
 * Initialize database connection
 */
export async function initializeDatabase(): Promise<Result<void>> {
  try {
    await prisma.$connect();
    isConnected = true;
    logger.info('Database connected successfully');
    return success(undefined);
  } catch (error) {
    logger.error('Failed to connect to database', { error });
    return failure(new DatabaseError(
      'Failed to connect to database',
      'CONNECTION_FAILED',
      undefined,
      error instanceof Error ? error : new Error(String(error))
    ));
  }
}

/**
 * Close database connection
 */
export async function closeDatabase(): Promise<void> {
  try {
    await prisma.$disconnect();
    isConnected = false;
    logger.info('Database disconnected');
  } catch (error) {
    logger.error('Error disconnecting from database', { error });
  }
}

/**
 * Check if database is connected
 */
export function isDatabaseConnected(): boolean {
  return isConnected;
}

/**
 * Health check for database
 */
export async function checkDatabaseHealth(): Promise<Result<{ status: string; latency: number }>> {
  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const latency = Date.now() - start;
    
    return success({
      status: 'healthy',
      latency,
    });
  } catch (error) {
    logger.error('Database health check failed', { error });
    return failure(new DatabaseError(
      'Database health check failed',
      'HEALTH_CHECK_FAILED',
      undefined,
      error instanceof Error ? error : new Error(String(error))
    ));
  }
}

/**
 * Execute database operation with retry logic
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = config.RETRY_ATTEMPTS,
  delayMs: number = 500
): Promise<Result<T>> {
  let lastError: Error | undefined;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await operation();
      return success(result);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt === maxRetries) {
        break;
      }
      
      logger.warn(`Database operation failed, retrying (${attempt}/${maxRetries})`, {
        error: lastError.message,
        attempt,
        delayMs,
      });
      
      await new Promise(resolve => setTimeout(resolve, delayMs));
      delayMs *= 2; // Exponential backoff
    }
  }
  
  logger.error('Database operation failed after all retries', {
    error: lastError,
    maxRetries,
  });
  
  return failure(new DatabaseError(
    `Database operation failed after ${maxRetries} attempts`,
    'OPERATION_FAILED',
    { maxRetries },
    lastError
  ));
}

// Export the Prisma client
export { prisma };
export default prisma;
