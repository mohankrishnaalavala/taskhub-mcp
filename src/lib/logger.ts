import pino from 'pino';
import { config } from '@/config/env.js';

// Create logger instance with configuration
const loggerOptions: any = {
  level: config.LOG_LEVEL,
  formatters: {
    level: (label: string) => {
      return { level: label.toUpperCase() };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'token',
      'password',
      'authorization',
      'github_token',
      'bearer_token',
      '*.token',
      '*.password',
      '*.authorization',
    ],
    censor: '[REDACTED]',
  },
};

if (config.NODE_ENV === 'development') {
  loggerOptions.transport = {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
  };
}

const logger = pino(loggerOptions);

/**
 * Sanitize sensitive data from objects before logging
 */
export function sanitize(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    // Redact potential tokens/secrets
    if (obj.startsWith('ghp_') || obj.startsWith('Bearer ') || obj.length > 50) {
      return '[REDACTED]';
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sanitize);
  }

  if (typeof obj === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes('token') ||
        lowerKey.includes('password') ||
        lowerKey.includes('secret')
      ) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = sanitize(value);
      }
    }
    return sanitized;
  }

  return obj;
}

/**
 * Create a child logger with additional context
 */
export function createChildLogger(context: Record<string, any>) {
  return logger.child(sanitize(context));
}

export { logger };
export default logger;
