import { z } from 'zod';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Environment validation schema
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  
  // Database
  DATABASE_URL: z.string().default('file:./dev.db'),
  
  // GitHub
  GITHUB_TOKEN: z.string().min(1, 'GitHub token is required'),
  ALLOWED_REPOS: z.string().min(1, 'At least one allowed repo is required'),
  
  // Authentication
  BEARER_TOKEN: z.string().min(1, 'Bearer token is required'),
  
  // Safety & Limits
  DRY_RUN: z.coerce.boolean().default(true),
  MAX_FILE_SIZE_MB: z.coerce.number().default(1),
  MAX_PATCH_SIZE_MB: z.coerce.number().default(10),
  
  // Logging
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  
  // Retry Configuration
  RETRY_ATTEMPTS: z.coerce.number().default(3),
  RETRY_DELAY_MS: z.coerce.number().default(1000),
  
  // Health Check
  HEALTH_CHECK_ENABLED: z.coerce.boolean().default(true),
});

// Validate and export configuration
const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error('❌ Invalid environment configuration:');
  console.error(result.error.format());
  process.exit(1);
}

export const config = result.data;

// Derived configurations
export const derivedConfig = {
  isDevelopment: config.NODE_ENV === 'development',
  isProduction: config.NODE_ENV === 'production',
  isTest: config.NODE_ENV === 'test',
  allowedRepos: config.ALLOWED_REPOS.split(',').map(repo => repo.trim()),
  maxFileSizeBytes: config.MAX_FILE_SIZE_MB * 1024 * 1024,
  maxPatchSizeBytes: config.MAX_PATCH_SIZE_MB * 1024 * 1024,
};

// Export types
export type Config = typeof config;
export type DerivedConfig = typeof derivedConfig;
