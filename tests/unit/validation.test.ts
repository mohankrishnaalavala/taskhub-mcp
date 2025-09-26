/**
 * Unit tests for input validation schemas
 */

import { describe, it, expect } from 'vitest';
import {
  SubmitSpecSchema,
  ListTasksSchema,
  ClaimTaskSchema,
  StartBranchSchema,
  PushPatchSchema,
  OpenPrSchema,
  PostReviewSchema,
  validateInput,
} from '../../src/lib/validation.js';

describe('Validation Schemas', () => {
  describe('SubmitSpecSchema', () => {
    it('should validate correct input', () => {
      const input = {
        title: 'Test Task',
        description: 'A test task description that is long enough',
        acceptance_criteria: ['Criterion 1', 'Criterion 2'],
        repo: 'owner/repo',
      };
      
      const result = validateInput(SubmitSpecSchema, input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe('Test Task');
      }
    });

    it('should reject invalid title length', () => {
      const input = {
        title: 'AB', // Too short
        description: 'A test task description that is long enough',
        acceptance_criteria: ['Criterion 1'],
      };
      
      const result = validateInput(SubmitSpecSchema, input);
      expect(result.success).toBe(false);
    });

    it('should reject invalid repo format', () => {
      const input = {
        title: 'Test Task',
        description: 'A test task description that is long enough',
        acceptance_criteria: ['Criterion 1'],
        repo: 'invalid-repo-format',
      };
      
      const result = validateInput(SubmitSpecSchema, input);
      expect(result.success).toBe(false);
    });
  });

  describe('ListTasksSchema', () => {
    it('should validate with all optional fields', () => {
      const input = {
        status: 'todo',
        assignee: 'user1',
        repo: 'owner/repo',
        limit: 10,
        offset: 0,
      };
      
      const result = validateInput(ListTasksSchema, input);
      expect(result.success).toBe(true);
    });

    it('should validate with no fields (all optional)', () => {
      const result = validateInput(ListTasksSchema, {});
      expect(result.success).toBe(true);
    });

    it('should reject invalid status', () => {
      const input = { status: 'invalid_status' };
      const result = validateInput(ListTasksSchema, input);
      expect(result.success).toBe(false);
    });
  });

  describe('ClaimTaskSchema', () => {
    it('should validate correct input', () => {
      const input = {
        task_id: 1,
        assignee: 'user1',
      };
      
      const result = validateInput(ClaimTaskSchema, input);
      expect(result.success).toBe(true);
    });

    it('should reject negative task_id', () => {
      const input = {
        task_id: -1,
        assignee: 'user1',
      };
      
      const result = validateInput(ClaimTaskSchema, input);
      expect(result.success).toBe(false);
    });
  });

  describe('StartBranchSchema', () => {
    it('should validate with minimal input', () => {
      const input = { task_id: 1 };
      const result = validateInput(StartBranchSchema, input);
      expect(result.success).toBe(true);
    });

    it('should validate with all fields', () => {
      const input = {
        task_id: 1,
        repo: 'owner/repo',
        branch_name: 'feature/test-branch',
        base_branch: 'main',
        dry_run: true,
      };
      
      const result = validateInput(StartBranchSchema, input);
      expect(result.success).toBe(true);
    });
  });

  describe('PushPatchSchema', () => {
    it('should validate correct input', () => {
      const input = {
        task_id: 1,
        branch_name: 'feature/test',
        files: [
          {
            path: 'src/test.js',
            content: 'console.log("test");',
            encoding: 'utf-8',
          },
        ],
      };
      
      const result = validateInput(PushPatchSchema, input);
      expect(result.success).toBe(true);
    });

    it('should reject empty files array', () => {
      const input = {
        task_id: 1,
        branch_name: 'feature/test',
        files: [],
      };
      
      const result = validateInput(PushPatchSchema, input);
      expect(result.success).toBe(false);
    });

    it('should validate base64 encoding', () => {
      const input = {
        task_id: 1,
        branch_name: 'feature/test',
        files: [
          {
            path: 'image.png',
            content: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
            encoding: 'base64',
          },
        ],
      };
      
      const result = validateInput(PushPatchSchema, input);
      expect(result.success).toBe(true);
    });
  });

  describe('OpenPrSchema', () => {
    it('should validate minimal input', () => {
      const input = { task_id: 1 };
      const result = validateInput(OpenPrSchema, input);
      expect(result.success).toBe(true);
    });

    it('should validate with all fields', () => {
      const input = {
        task_id: 1,
        repo: 'owner/repo',
        title: 'Test PR',
        draft: false,
        force: true,
        dry_run: true,
      };
      
      const result = validateInput(OpenPrSchema, input);
      expect(result.success).toBe(true);
    });

    it('should apply default values', () => {
      const input = { task_id: 1 };
      const result = validateInput(OpenPrSchema, input);
      
      if (result.success) {
        expect(result.data.draft).toBe(true);
        expect(result.data.force).toBe(false);
        expect(result.data.dry_run).toBe(false);
      }
    });
  });

  describe('PostReviewSchema', () => {
    it('should validate with task_id', () => {
      const input = {
        task_id: 1,
        notes: 'Review notes',
      };
      
      const result = validateInput(PostReviewSchema, input);
      expect(result.success).toBe(true);
    });

    it('should validate with pr_number', () => {
      const input = {
        pr_number: 123,
        repo: 'owner/repo',
        notes: 'Review notes',
      };
      
      const result = validateInput(PostReviewSchema, input);
      expect(result.success).toBe(true);
    });

    it('should reject when neither task_id nor pr_number provided', () => {
      const input = {
        notes: 'Review notes',
      };
      
      const result = validateInput(PostReviewSchema, input);
      expect(result.success).toBe(false);
    });

    it('should validate with both task_id and pr_number', () => {
      const input = {
        task_id: 1,
        pr_number: 123,
        notes: 'Review notes',
      };
      
      const result = validateInput(PostReviewSchema, input);
      expect(result.success).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should provide detailed error information', () => {
      const input = {
        title: '', // Invalid
        description: 'short', // Too short
        acceptance_criteria: [], // Empty array
      };
      
      const result = validateInput(SubmitSpecSchema, input);
      expect(result.success).toBe(false);
      
      if (!result.success) {
        expect(result.error.type).toBe('validation');
        expect(result.error.code).toBe('VALIDATION_FAILED');
        expect(result.error.details).toBeDefined();
      }
    });
  });
});
