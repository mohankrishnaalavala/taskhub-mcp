/**
 * start_branch MCP Tool
 *
 * Creates a new Git branch for task work based on task requirements
 */

import { Logger } from 'pino';
import { validateInput, StartBranchSchema, StartBranchInput } from '../lib/validation.js';
import { withRetry, prisma } from '../lib/database.js';
import { getGitHubClient } from '../lib/github.js';
import { ToolResult, StartBranchResponse } from '../types/mcp.js';
import {
  success,
  failure,
  isFailure,
  NotFoundError,
  ConflictError,
  ValidationError,
} from '../types/errors.js';
import { validateActionForStateWithDetails } from '../lib/state-machine.js';

/**
 * Generate a branch name from task title using feature/{slug}-{task_id} format
 * Following Phase 4.5 specification for improved PR hygiene
 */
function generateBranchName(taskId: number, title: string): string {
  // Convert title to kebab-case slug and limit length
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single
    .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens

  // Limit slug to 40 characters to keep total branch name reasonable
  const truncatedSlug = slug.substring(0, 40).replace(/-$/, '');

  // Use feature/{slug}-{task_id} format as specified in Phase 4.5
  return `feature/${truncatedSlug}-${taskId}`;
}

/**
 * Start a new branch for task work
 */
export async function startBranchTool(args: unknown, logger: Logger): Promise<ToolResult> {
  logger.debug('Processing start_branch request', { args });

  // Validate input
  const validationResult = validateInput(StartBranchSchema, args);
  if (isFailure(validationResult)) {
    logger.warn('start_branch validation failed', {
      error: validationResult.error,
      args,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: {
              type: validationResult.error.type,
              message: validationResult.error.message,
              code: validationResult.error.code,
              details: validationResult.error.details,
            },
          }),
        },
      ],
      isError: true,
    };
  }

  const input = validationResult.data;
  const requestId = Math.random().toString(36).substring(2, 8);

  logger.info('Processing start_branch request', {
    requestId,
    taskId: input.task_id,
    repo: input.repo,
    dryRun: input.dry_run,
  });

  try {
    // Get GitHub client
    const githubClientResult = getGitHubClient();
    if (isFailure(githubClientResult)) {
      logger.error('Failed to get GitHub client', {
        requestId,
        error: githubClientResult.error,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: {
                type: githubClientResult.error.type,
                message: githubClientResult.error.message,
                code: githubClientResult.error.code,
                details: githubClientResult.error.details,
              },
            }),
          },
        ],
        isError: true,
      };
    }

    const githubClient = githubClientResult.data;

    // 1) Load task (no retry) and validate transition
    const task = await prisma.task.findUnique({
      where: { id: input.task_id },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        assignee: true,
        repo: true,
        acceptanceCriteria: true,
      },
    });

    if (!task) {
      return {
        content: [
          { type: 'text', text: JSON.stringify({ error: { type: 'not_found', code: 'TASK_NOT_FOUND', message: `Task with ID ${input.task_id} not found`, details: { taskId: input.task_id } } }) },
        ],
        isError: true,
      };
    }

    try {
      validateActionForStateWithDetails('start_branch', task.status as any, input.task_id);
    } catch (e) {
      // State errors are not DB-related; surface directly
      const err = e as any;
      return {
        content: [
          { type: 'text', text: JSON.stringify({ error: { type: err.type || 'validation', code: err.code || 'STATE_INVALID', message: err.message || 'Invalid state for start_branch', details: err.details || {} } }) },
        ],
        isError: true,
      };
    }

    // 2) Resolve repo and branch names (no retry)
    const repoString = input.repo || task.repo;
    if (!repoString) {
      return {
        content: [
          { type: 'text', text: JSON.stringify({ error: { type: 'validation', code: 'REPO_REQUIRED', message: 'Repository must be specified either in the request or in the task', details: { taskId: input.task_id } } }) },
        ],
        isError: true,
      };
    }

    const repoParts = repoString.split('/');
    if (repoParts.length !== 2 || !repoParts[0] || !repoParts[1]) {
      return {
        content: [
          { type: 'text', text: JSON.stringify({ error: { type: 'validation', code: 'INVALID_REPO_FORMAT', message: 'Repository must be in format "owner/repo"', details: { repo: repoString } } }) },
        ],
        isError: true,
      };
    }
    const repo = { owner: repoParts[0], repo: repoParts[1] } as const;
    const branchName = input.branch_name || generateBranchName(task.id, task.title);

    // 3) Query GitHub (no DB retry here)
    const repoInfoResult = await githubClient.getRepository(repo);
    if (isFailure(repoInfoResult)) {
      return {
        content: [
          { type: 'text', text: JSON.stringify({ error: repoInfoResult.error }) },
        ],
        isError: true,
      };
    }
    const repoInfo = repoInfoResult.data;

    const createBranchResult = await githubClient.createBranch({
      repo,
      branchName,
      fromBranch: input.base_branch || repoInfo.defaultBranch,
      dryRun: input.dry_run ?? false,
    });
    if (isFailure(createBranchResult)) {
      return {
        content: [
          { type: 'text', text: JSON.stringify({ error: createBranchResult.error }) },
        ],
        isError: true,
      };
    }
    const branch = createBranchResult.data;

    // 4) Persist branch and optional status change (retry only DB writes)
    const updateTaskResult = await withRetry(async () =>
      prisma.task.update({
        where: { id: input.task_id },
        data: {
          // always persist the branch we created
          branch: branchName,
          // update repo if provided
          repo: repoString,
          // if currently claimed, move to in_progress
          status: task.status === 'claimed' ? 'in_progress' : task.status,
          updatedAt: new Date(),
        },
      })
    );
    if (isFailure(updateTaskResult)) {
      return {
        content: [
          { type: 'text', text: JSON.stringify({ error: updateTaskResult.error }) },
        ],
        isError: true,
      };
    }
    const updatedTask = updateTaskResult.data as typeof task;

    // Log events (retry writes)
    if (task.status === 'claimed') {
      await withRetry(async () =>
        prisma.event.create({
          data: {
            taskId: input.task_id,
            actor: task.assignee || 'system',
            action: 'task_status_changed',
            payload: JSON.stringify({
              previous_status: task.status,
              new_status: 'in_progress',
              branch_created: branchName,
              repo: repoString,
              timestamp: new Date().toISOString(),
            }),
          },
        })
      );
    }

    await withRetry(async () =>
      prisma.event.create({
        data: {
          taskId: input.task_id,
          actor: task.assignee || 'system',
          action: 'branch_created',
          payload: JSON.stringify({
            branch_name: branchName,
            repo: repoString,
            base_branch: input.base_branch || repoInfo.defaultBranch,
            sha: branch.sha,
            dry_run: input.dry_run || false,
            timestamp: new Date().toISOString(),
          }),
        },
      })
    );

    const response: StartBranchResponse = {
      task_id: updatedTask.id,
      branch_name: branchName,
      repo: repoString,
      base_branch: input.base_branch || repoInfo.defaultBranch,
      branch_sha: branch.sha,
      status: (task.status === 'claimed' ? 'in_progress' : task.status) as any,
      dry_run: input.dry_run || false,
    };

    logger.info('Branch created successfully', {
      requestId,
      taskId: updatedTask.id,
      branchName,
      repo: repoString,
      dryRun: input.dry_run,
    });

    return {
      content: [
        { type: 'text', text: JSON.stringify(response) },
      ],
    };
  } catch (error) {
    logger.error('Unexpected error in start_branch', {
      requestId,
      taskId: input.task_id,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: {
              type: 'internal',
              message: 'Internal server error while creating branch',
              code: 'INTERNAL_ERROR',
              details: { requestId },
            },
          }),
        },
      ],
      isError: true,
    };
  }
}
