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
import { success, failure, isFailure, NotFoundError, ConflictError, ValidationError } from '../types/errors.js';
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
      args 
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

    // Use database retry wrapper for the branch creation operation
    const branchResult = await withRetry(async () => {
      // Get task details
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
        throw new NotFoundError(
          `Task with ID ${input.task_id} not found`,
          'TASK_NOT_FOUND',
          { taskId: input.task_id }
        );
      }

      // Validate state machine transition (Phase 4.5)
      try {
        validateActionForStateWithDetails('start_branch', task.status as any, input.task_id);
      } catch (error) {
        // Re-throw state machine errors directly (don't retry)
        throw error;
      }

      // Use provided repo or task's repo
      const repoString = input.repo || task.repo;
      if (!repoString) {
        throw new ValidationError(
          'Repository must be specified either in the request or in the task',
          'REPO_REQUIRED',
          { taskId: input.task_id }
        );
      }

      // Parse repository string
      const repoParts = repoString.split('/');
      if (repoParts.length !== 2 || !repoParts[0] || !repoParts[1]) {
        throw new ValidationError(
          'Repository must be in format "owner/repo"',
          'INVALID_REPO_FORMAT',
          { repo: repoString }
        );
      }

      const repo = { owner: repoParts[0], repo: repoParts[1] };

      // Generate branch name
      const branchName = input.branch_name || generateBranchName(task.id, task.title);

      // Get repository information
      const repoInfoResult = await githubClient.getRepository(repo);
      if (isFailure(repoInfoResult)) {
        throw repoInfoResult.error;
      }

      const repoInfo = repoInfoResult.data;

      // Create the branch
      const createBranchResult = await githubClient.createBranch({
        repo,
        branchName,
        fromBranch: input.base_branch || repoInfo.defaultBranch,
        dryRun: input.dry_run ?? false,
      });

      if (isFailure(createBranchResult)) {
        throw createBranchResult.error;
      }

      const branch = createBranchResult.data;

      // Update task status to in_progress if not already
      let updatedTask = task;
      if (task.status === 'claimed') {
        updatedTask = await prisma.task.update({
          where: { id: input.task_id },
          data: {
            status: 'in_progress',
            repo: repoString, // Update repo if it was provided
            updatedAt: new Date(),
          },
        });

        // Log the status change event
        await prisma.event.create({
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
        });
      }

      // Log the branch creation event
      await prisma.event.create({
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
      });

      return {
        task: updatedTask,
        branch,
        repo: repoString,
        branchName,
        baseBranch: input.base_branch || repoInfo.defaultBranch,
      };
    });

    if (isFailure(branchResult)) {
      logger.error('Failed to create branch', {
        requestId,
        taskId: input.task_id,
        error: branchResult.error,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: {
                type: branchResult.error.type,
                message: branchResult.error.message,
                code: branchResult.error.code,
                details: branchResult.error.details,
              },
            }),
          },
        ],
        isError: true,
      };
    }

    const result = branchResult.data;

    const response: StartBranchResponse = {
      task_id: result.task.id,
      branch_name: result.branchName,
      repo: result.repo,
      base_branch: result.baseBranch,
      branch_sha: result.branch.sha,
      status: result.task.status as any,
      dry_run: input.dry_run || false,
    };

    logger.info('Branch created successfully', {
      requestId,
      taskId: result.task.id,
      branchName: result.branchName,
      repo: result.repo,
      dryRun: input.dry_run,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response),
        },
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
