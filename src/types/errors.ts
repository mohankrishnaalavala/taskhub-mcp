/**
 * Error types and Result pattern for TaskHub MCP server
 */

// Error categories as defined in readme.md
export enum ErrorType {
  VALIDATION = 'validation',
  AUTH = 'auth',
  RATE_LIMIT = 'rate_limit',
  NOT_FOUND = 'not_found',
  CONFLICT = 'conflict',
  GITHUB_API = 'github_api',
  DATABASE = 'database',
  INTERNAL = 'internal',
}

// Base error interface
export interface TaskHubError {
  type: ErrorType;
  message: string;
  code: string;
  details: Record<string, any>;
  retryAfter?: number | undefined;
  cause?: Error | undefined;
}

// Result pattern for consistent error handling
export type Result<T, E extends TaskHubError = TaskHubError> =
  | { success: true; data: T }
  | { success: false; error: E };

// Specific error classes that implement TaskHubError
export class ValidationError implements TaskHubError {
  readonly type = ErrorType.VALIDATION;

  constructor(
    public message: string,
    public code: string = 'VALIDATION_FAILED',
    public details: Record<string, any> = {},
    public cause?: Error
  ) {}
}

export class AuthError implements TaskHubError {
  readonly type = ErrorType.AUTH;

  constructor(
    public message: string,
    public code: string = 'AUTH_FAILED',
    public details: Record<string, any> = {},
    public cause?: Error
  ) {}
}

export class NotFoundError implements TaskHubError {
  readonly type = ErrorType.NOT_FOUND;

  constructor(
    public message: string,
    public code: string = 'NOT_FOUND',
    public details: Record<string, any> = {},
    public cause?: Error
  ) {}
}

export class ConflictError implements TaskHubError {
  readonly type = ErrorType.CONFLICT;

  constructor(
    public message: string,
    public code: string = 'CONFLICT',
    public details: Record<string, any> = {},
    public cause?: Error
  ) {}
}

export class GitHubApiError implements TaskHubError {
  readonly type = ErrorType.GITHUB_API;

  constructor(
    public message: string,
    public code: string = 'GITHUB_API_ERROR',
    public details: Record<string, any> = {},
    public retryAfter?: number,
    public cause?: Error
  ) {}
}

export class DatabaseError implements TaskHubError {
  readonly type = ErrorType.DATABASE;

  constructor(
    public message: string,
    public code: string = 'DATABASE_ERROR',
    public details: Record<string, any> = {},
    public cause?: Error
  ) {}
}

export class InternalError implements TaskHubError {
  readonly type = ErrorType.INTERNAL;

  constructor(
    public message: string,
    public code: string = 'INTERNAL_ERROR',
    public details: Record<string, any> = {},
    public cause?: Error
  ) {}
}

// Utility functions for Result pattern
export function success<T>(data: T): Result<T> {
  return { success: true, data };
}

export function failure<E extends TaskHubError = TaskHubError>(error: E): Result<never, E> {
  return { success: false, error };
}

// Type guards
export function isSuccess<T, E extends TaskHubError = TaskHubError>(result: Result<T, E>): result is { success: true; data: T } {
  return result.success;
}

export function isFailure<T, E extends TaskHubError = TaskHubError>(result: Result<T, E>): result is { success: false; error: E } {
  return !result.success;
}
