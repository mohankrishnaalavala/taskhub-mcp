/**
 * post_review MCP Tool
 *
 * Posts reviews on GitHub pull requests with block/unblock functionality
 * Supports both task-based and direct PR number reviews
 */

import { Logger } from 'pino';
import { validateInput, PostReviewSchema, PostReviewInput } from '../lib/validation.js';
import { withRetry, prisma } from '../lib/database.js';
import { getGitHubClient } from '../lib/github.js';
import { ToolResult, PostReviewResponse } from '../types/mcp.js';
import { success, failure, isFailure, NotFoundError, ValidationError } from '../types/errors.js';

/**
 * Determine review event type based on block status and notes content
 */
function determineReviewEvent(
  block: boolean,
  notes: string
): 'COMMENT' | 'APPROVE' | 'REQUEST_CHANGES' {
  if (block) {
    return 'REQUEST_CHANGES';
  }

  // Check for approval keywords in notes
  const approvalKeywords = [
    'approve',
    'approved',
    'lgtm',
    'looks good',
    'merge when',
    'ready to merge',
  ];
  const notesLower = notes.toLowerCase();

  if (approvalKeywords.some(keyword => notesLower.includes(keyword))) {
    return 'APPROVE';
  }

  return 'COMMENT';
}

/**
 * Determine review status based on event type
 */
function determineReviewStatus(event: string, block: boolean): 'posted' | 'blocked' | 'approved' {
  if (event === 'REQUEST_CHANGES' || block) {
    return 'blocked';
  }
  if (event === 'APPROVE') {
    return 'approved';
  }
  return 'posted';
}

/**
 * Post a review on a pull request
 */
export async function postReviewTool(args: unknown, logger: Logger): Promise<ToolResult> {
  logger.debug('Processing post_review request', { args });

  // Validate input
  const validationResult = validateInput(PostReviewSchema, args);
  if (isFailure(validationResult)) {
    logger.warn('post_review validation failed', {
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

  logger.info('Processing post_review request', {
    requestId,
    taskId: input.task_id,
    prNumber: input.pr_number,
    repo: input.repo,
    block: input.block,
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

    // Use database retry wrapper for the review operation
    const reviewResult = await withRetry(async () => {
      let task = null;
      let prNumber = input.pr_number;
      let repoString = input.repo;

      // If task_id is provided, get task details and PR info
      if (input.task_id) {
        task = await prisma.task.findUnique({
          where: { id: input.task_id },
          select: {
            id: true,
            title: true,
            status: true,
            assignee: true,
            repo: true,
            branch: true,
          },
        });

        if (!task) {
          throw new NotFoundError(`Task with ID ${input.task_id} not found`, 'TASK_NOT_FOUND', {
            taskId: input.task_id,
          });
        }

        // Use task's repo if not provided
        repoString = repoString || task.repo || undefined;

        // For task-based reviews, we need to find the PR number from events
        if (!prNumber) {
          const prEvent = await prisma.event.findFirst({
            where: {
              taskId: input.task_id,
              action: 'pr_opened',
            },
            orderBy: {
              createdAt: 'desc',
            },
          });

          if (prEvent) {
            try {
              const eventData = JSON.parse(prEvent.payload);
              prNumber = eventData.pr_number;
            } catch (error) {
              logger.warn('Failed to parse PR event data', {
                taskId: input.task_id,
                eventId: prEvent.id,
              });
            }
          }

          if (!prNumber) {
            throw new ValidationError(
              `No PR found for task ${input.task_id}. Create a PR first with open_pr.`,
              'TASK_NO_PR',
              { taskId: input.task_id }
            );
          }
        }
      }

      // Validate repository
      if (!repoString) {
        throw new ValidationError(
          'Repository must be specified either in the request, task, or inferred from PR',
          'REPO_REQUIRED',
          { taskId: input.task_id, prNumber }
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

      // Determine review event type
      const reviewEvent = determineReviewEvent(input.block || false, input.notes);

      // Create the review
      const createReviewResult = await githubClient.createReview({
        repo,
        pullNumber: prNumber!,
        body: input.notes,
        event: reviewEvent,
        dryRun: input.dry_run || false,
      });

      if (isFailure(createReviewResult)) {
        throw createReviewResult.error;
      }

      const review = createReviewResult.data;
      const reviewStatus = determineReviewStatus(reviewEvent, input.block || false);

      // Update task status if this is a task-based review and it's approved
      if (task && reviewStatus === 'approved' && task.status === 'review') {
        await prisma.task.update({
          where: { id: task.id },
          data: {
            status: 'done',
            updatedAt: new Date(),
          },
        });
      }

      // Log the review event
      const eventData = {
        pr_number: prNumber,
        review_id: review.id,
        review_url: review.html_url,
        event: reviewEvent,
        status: reviewStatus,
        block: input.block || false,
        repo: repoString,
        dry_run: input.dry_run || false,
        timestamp: new Date().toISOString(),
      };

      if (task) {
        await prisma.event.create({
          data: {
            taskId: task.id,
            actor: task.assignee || 'reviewer',
            action: 'review_posted',
            payload: JSON.stringify(eventData),
          },
        });
      }

      return {
        task,
        review,
        prNumber: prNumber!,
        repo: repoString,
        reviewStatus,
      };
    });

    if (isFailure(reviewResult)) {
      logger.error('Failed to post review', {
        requestId,
        taskId: input.task_id,
        prNumber: input.pr_number,
        error: reviewResult.error,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: {
                type: reviewResult.error.type,
                message: reviewResult.error.message,
                code: reviewResult.error.code,
                details: reviewResult.error.details,
              },
            }),
          },
        ],
        isError: true,
      };
    }

    const result = reviewResult.data;

    const response: PostReviewResponse = {
      review_id: result.review.id.toString(),
      task_id: result.task?.id,
      pr_number: result.prNumber,
      repo: result.repo,
      notes: input.notes,
      block: input.block || false,
      status: result.reviewStatus,
      dry_run: input.dry_run || false,
      posted_at: new Date().toISOString(),
    };

    logger.info('Review posted successfully', {
      requestId,
      taskId: result.task?.id,
      prNumber: result.prNumber,
      reviewId: result.review.id,
      status: result.reviewStatus,
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
    logger.error('Unexpected error in post_review', {
      requestId,
      taskId: input.task_id,
      prNumber: input.pr_number,
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
              message: 'Internal server error while posting review',
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
