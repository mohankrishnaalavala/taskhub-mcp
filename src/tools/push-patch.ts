/**
 * push_patch MCP Tool
 * 
 * Uploads code changes to the task branch with validation and dry-run support
 */

import { Logger } from 'pino';
import { validateInput, PushPatchSchema, PushPatchInput } from '../lib/validation.js';
import { withRetry, prisma } from '../lib/database.js';
import { getGitHubClient, GitHubFile } from '../lib/github.js';
import { ToolResult, PushPatchResponse } from '../types/mcp.js';
import { success, failure, isFailure, NotFoundError, ConflictError, ValidationError } from '../types/errors.js';

/**
 * Push code changes to a task branch
 */
export async function pushPatchTool(args: unknown, logger: Logger): Promise<ToolResult> {
  logger.debug('Processing push_patch request', { args });

  // Validate input
  const validationResult = validateInput(PushPatchSchema, args);
  if (isFailure(validationResult)) {
    logger.warn('push_patch validation failed', { 
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
  
  logger.info('Processing push_patch request', {
    requestId,
    taskId: input.task_id,
    filesCount: input.files.length,
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

    // Use database retry wrapper for the push operation
    const pushResult = await withRetry(async () => {
      // Get task details
      const task = await prisma.task.findUnique({
        where: { id: input.task_id },
        select: {
          id: true,
          title: true,
          status: true,
          assignee: true,
          repo: true,
        },
      });

      if (!task) {
        throw new NotFoundError(
          `Task with ID ${input.task_id} not found`,
          'TASK_NOT_FOUND',
          { taskId: input.task_id }
        );
      }

      // Check if task is in the right status for pushing changes
      if (task.status !== 'in_progress') {
        throw new ConflictError(
          `Task ${input.task_id} must be in progress to push changes`,
          'TASK_NOT_IN_PROGRESS',
          { 
            taskId: input.task_id,
            currentStatus: task.status,
            requiredStatus: 'in_progress',
          }
        );
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

      // Validate files
      const githubFiles: GitHubFile[] = input.files.map((file) => ({
        path: file.path,
        content: file.content,
        encoding: file.encoding || 'utf-8',
      }));

      // Generate commit message
      const commitMessage = input.commit_message || `Update files for task ${input.task_id}: ${task.title}`;

      // Push files to the branch
      const pushFilesResult = await githubClient.pushFiles({
        repo,
        branch: input.branch_name,
        files: githubFiles,
        commitMessage,
        dryRun: input.dry_run ?? false,
      });

      if (isFailure(pushFilesResult)) {
        throw pushFilesResult.error;
      }

      const pushInfo = pushFilesResult.data;

      // Log the push event
      await prisma.event.create({
        data: {
          taskId: input.task_id,
          actor: task.assignee || 'system',
          action: 'files_pushed',
          payload: JSON.stringify({
            branch_name: input.branch_name,
            repo: repoString,
            files_changed: pushInfo.filesChanged,
            commit_sha: pushInfo.commitSha,
            commit_message: commitMessage,
            dry_run: input.dry_run || false,
            timestamp: new Date().toISOString(),
          }),
        },
      });

      return {
        task,
        repo: repoString,
        pushInfo,
        commitMessage,
      };
    });

    if (isFailure(pushResult)) {
      logger.error('Failed to push patch', {
        requestId,
        taskId: input.task_id,
        error: pushResult.error,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: {
                type: pushResult.error.type,
                message: pushResult.error.message,
                code: pushResult.error.code,
                details: pushResult.error.details,
              },
            }),
          },
        ],
        isError: true,
      };
    }

    const result = pushResult.data;

    const response: PushPatchResponse = {
      task_id: result.task.id,
      branch_name: input.branch_name,
      repo: result.repo,
      commit_sha: result.pushInfo.commitSha,
      files_changed: result.pushInfo.filesChanged,
      commit_message: result.commitMessage,
      dry_run: input.dry_run || false,
    };

    logger.info('Patch pushed successfully', {
      requestId,
      taskId: result.task.id,
      branchName: input.branch_name,
      repo: result.repo,
      filesChanged: result.pushInfo.filesChanged,
      commitSha: result.pushInfo.commitSha,
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
    logger.error('Unexpected error in push_patch', {
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
              message: 'Internal server error while pushing patch',
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
