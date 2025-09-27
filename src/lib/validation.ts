import { z } from 'zod';
import { ValidationError, Result, success, failure } from '../types/errors.js';
import { derivedConfig } from '../config/env.js';

// Common validation patterns
const repoPattern = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;
const filePathPattern = /^[^/].*[^/]$/;

// Task status enum
export const TaskStatus = z.enum(['todo', 'claimed', 'in_progress', 'review', 'done']);
export type TaskStatus = z.infer<typeof TaskStatus>;

// Artifact type enum
export const ArtifactType = z.enum(['commit', 'patch', 'review', 'pr']);
export type ArtifactType = z.infer<typeof ArtifactType>;

// MCP Tool Schemas as defined in readme.md

// submit_spec schema
export const SubmitSpecSchema = z.object({
  title: z.string().min(3).max(140),
  description: z.string().min(10).max(5000),
  acceptance_criteria: z.array(z.string()).min(1).max(20),
  repo: z.string().regex(repoPattern).optional(),
});
export type SubmitSpecInput = z.infer<typeof SubmitSpecSchema>;

// list_tasks schema
export const ListTasksSchema = z.object({
  status: TaskStatus.optional(),
  assignee: z.string().optional(),
  repo: z.string().regex(repoPattern).optional(),
  // Coerce numeric query params coming from HTTP strings
  limit: z.coerce.number().min(1).max(100).optional().default(50),
  offset: z.coerce.number().min(0).optional().default(0),
});
export type ListTasksInput = z.infer<typeof ListTasksSchema>;

// claim_task schema
export const ClaimTaskSchema = z.object({
  task_id: z.number().int().positive().describe('ID of the task to claim'),
  assignee: z.string().min(1).max(100).describe('Username of the person claiming the task'),
});
export type ClaimTaskInput = z.infer<typeof ClaimTaskSchema>;

// start_branch schema
export const StartBranchSchema = z.object({
  task_id: z.number().int().positive().describe('ID of the task to create a branch for'),
  repo: z
    .string()
    .regex(repoPattern)
    .optional()
    .describe('Repository in format owner/repo (optional if task has repo)'),
  branch_name: z
    .string()
    .min(1)
    .max(100)
    .optional()
    .describe('Custom branch name (optional, auto-generated if not provided)'),
  base_branch: z
    .string()
    .min(1)
    .max(100)
    .optional()
    .describe('Base branch to create from (optional, defaults to main/master)'),
  dry_run: z
    .boolean()
    .optional()
    .default(false)
    .describe('If true, simulate the operation without making changes'),
});
export type StartBranchInput = z.infer<typeof StartBranchSchema>;

// File schema for push_patch
export const FileSchema = z.object({
  path: z.string().min(1).max(500).describe('File path relative to repository root'),
  content: z.string().describe('File content'),
  encoding: z.enum(['utf-8', 'base64']).optional().default('utf-8').describe('Content encoding'),
});
export type FileInput = z.infer<typeof FileSchema>;

// push_patch schema
export const PushPatchSchema = z.object({
  task_id: z.number().int().positive().describe('ID of the task to push changes for'),
  branch_name: z.string().min(1).max(100).describe('Branch name to push changes to'),
  repo: z
    .string()
    .regex(repoPattern)
    .optional()
    .describe('Repository in format owner/repo (optional if task has repo)'),
  files: z.array(FileSchema).min(1).max(50).describe('Array of files to push (1-50 files)'),
  commit_message: z
    .string()
    .min(1)
    .max(500)
    .optional()
    .describe('Custom commit message (optional, auto-generated if not provided)'),
  dry_run: z
    .boolean()
    .optional()
    .default(false)
    .describe('If true, simulate the operation without making changes'),
});
export type PushPatchInput = z.infer<typeof PushPatchSchema>;

// open_pr schema
export const OpenPrSchema = z.object({
  task_id: z.number().int().positive().describe('ID of the task to create a PR for'),
  repo: z
    .string()
    .regex(repoPattern)
    .optional()
    .describe('Repository in format owner/repo (optional if task has repo)'),
  title: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe('Custom PR title (optional, auto-generated if not provided)'),
  draft: z
    .boolean()
    .optional()
    .default(true)
    .describe('Whether to create a draft PR (default: true)'),
  force: z
    .boolean()
    .optional()
    .default(false)
    .describe('Force create non-draft PR even if policy requires draft'),
  dry_run: z
    .boolean()
    .optional()
    .default(false)
    .describe('If true, simulate the operation without making changes'),
});
export type OpenPrInput = z.infer<typeof OpenPrSchema>;

// post_review schema
export const PostReviewSchema = z
  .object({
    task_id: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('ID of the task to review (either task_id or pr_number required)'),
    pr_number: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('PR number to review (either task_id or pr_number required)'),
    repo: z
      .string()
      .regex(repoPattern)
      .optional()
      .describe('Repository in format owner/repo (optional if task has repo)'),
    notes: z.string().min(1).max(2000).describe('Review notes and feedback (1-2000 characters)'),
    block: z
      .boolean()
      .optional()
      .default(false)
      .describe('Whether this review blocks the PR from being merged'),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe('If true, simulate the operation without making changes'),
  })
  .refine(data => data.task_id !== undefined || data.pr_number !== undefined, {
    message: 'Either task_id or pr_number must be provided',
    path: ['task_id', 'pr_number'],
  });
export type PostReviewInput = z.infer<typeof PostReviewSchema>;

// Validation utility functions

/**
 * Validate input against a Zod schema
 */
export function validateInput<T>(schema: z.ZodSchema<T>, input: unknown): Result<T> {
  try {
    const result = schema.safeParse(input);

    if (!result.success) {
      const errorDetails = result.error.errors.map(err => ({
        path: err.path.join('.'),
        message: err.message,
        code: err.code,
      }));

      return failure(
        new ValidationError('Input validation failed', 'VALIDATION_FAILED', {
          errors: errorDetails,
        })
      );
    }

    return success(result.data);
  } catch (error) {
    return failure(
      new ValidationError(
        'Validation error',
        'VALIDATION_ERROR',
        undefined,
        error instanceof Error ? error : new Error(String(error))
      )
    );
  }
}

/**
 * Validate repository against allowlist
 */
export function validateRepo(repo: string): Result<string> {
  if (!derivedConfig.allowedRepos.includes(repo)) {
    return failure(
      new ValidationError(`Repository '${repo}' is not in the allowed list`, 'REPO_NOT_ALLOWED', {
        repo,
        allowedRepos: derivedConfig.allowedRepos,
      })
    );
  }

  return success(repo);
}

/**
 * Validate file path for security
 */
export function validateFilePath(path: string): Result<string> {
  // Check for path traversal
  if (path.includes('../') || path.includes('..\\')) {
    return failure(
      new ValidationError('File path contains path traversal sequences', 'INVALID_FILE_PATH', {
        path,
      })
    );
  }

  // Check for hidden files
  if (path.startsWith('.') || path.includes('/.')) {
    return failure(
      new ValidationError('Hidden files are not allowed', 'HIDDEN_FILE_NOT_ALLOWED', { path })
    );
  }

  // Check for null bytes
  if (path.includes('\0')) {
    return failure(
      new ValidationError('File path contains null bytes', 'INVALID_FILE_PATH', { path })
    );
  }

  return success(path);
}

/**
 * Validate file size
 */
export function validateFileSize(
  content: string,
  encoding: 'utf8' | 'base64' = 'utf8'
): Result<void> {
  const sizeBytes =
    encoding === 'base64'
      ? Buffer.from(content, 'base64').length
      : Buffer.byteLength(content, 'utf8');

  if (sizeBytes > derivedConfig.maxFileSizeBytes) {
    return failure(
      new ValidationError(
        `File size ${sizeBytes} bytes exceeds maximum of ${derivedConfig.maxFileSizeBytes} bytes`,
        'FILE_TOO_LARGE',
        { sizeBytes, maxSizeBytes: derivedConfig.maxFileSizeBytes }
      )
    );
  }

  return success(undefined);
}

/**
 * Validate total patch size
 */
export function validatePatchSize(files: FileInput[]): Result<void> {
  const totalSize = files.reduce((sum, file) => {
    const sizeBytes =
      file.encoding === 'base64'
        ? Buffer.from(file.content, 'base64').length
        : Buffer.byteLength(file.content, 'utf8');
    return sum + sizeBytes;
  }, 0);

  if (totalSize > derivedConfig.maxPatchSizeBytes) {
    return failure(
      new ValidationError(
        `Total patch size ${totalSize} bytes exceeds maximum of ${derivedConfig.maxPatchSizeBytes} bytes`,
        'PATCH_TOO_LARGE',
        { totalSizeBytes: totalSize, maxSizeBytes: derivedConfig.maxPatchSizeBytes }
      )
    );
  }

  return success(undefined);
}
