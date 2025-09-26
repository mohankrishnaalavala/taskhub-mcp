import { describe, it, expect } from 'vitest';
import { success, failure, isSuccess, isFailure } from '@/types/errors.js';
import { ValidationError } from '@/types/errors.js';

describe('Basic functionality', () => {
  it('should create success result', () => {
    const result = success('test data');
    expect(isSuccess(result)).toBe(true);
    expect(result.data).toBe('test data');
  });

  it('should create failure result', () => {
    const error = new ValidationError('Test error');
    const result = failure(error);
    expect(isFailure(result)).toBe(true);
    expect(result.error.message).toBe('Test error');
  });

  it('should validate error types', () => {
    const error = new ValidationError('Test validation error', 'TEST_CODE', { field: 'test' });
    expect(error.type).toBe('validation');
    expect(error.code).toBe('TEST_CODE');
    expect(error.details).toEqual({ field: 'test' });
  });
});
