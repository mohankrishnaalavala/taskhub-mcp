/**
 * claim_task MCP Tool
 * 
 * Assigns a task to a user and updates the task status to 'claimed'
 */

import { Logger } from 'pino';
import { validateInput, ClaimTaskSchema, ClaimTaskInput } from '../lib/validation.js';
import { withRetry, prisma } from '../lib/database.js';
import { ToolResult, ClaimTaskResponse } from '../types/mcp.js';
import { success, failure, isFailure, NotFoundError, ConflictError } from '../types/errors.js';

/**
 * Claim a task for a user
 */
export async function claimTaskTool(args: unknown, logger: Logger): Promise<ToolResult> {
  logger.debug('Processing claim_task request', { args });

  // Validate input
  const validationResult = validateInput(ClaimTaskSchema, args);
  if (isFailure(validationResult)) {
    logger.warn('claim_task validation failed', { 
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
  
  logger.info('Processing claim_task request', {
    requestId,
    taskId: input.task_id,
    assignee: input.assignee,
  });

  try {
    // Use database retry wrapper for the claim operation
    const claimResult = await withRetry(async () => {
      // Check if task exists and get current status
      const existingTask = await prisma.task.findUnique({
        where: { id: input.task_id },
        select: {
          id: true,
          title: true,
          status: true,
          assignee: true,
          repo: true,
        },
      });

      if (!existingTask) {
        throw new NotFoundError(
          `Task with ID ${input.task_id} not found`,
          'TASK_NOT_FOUND',
          { taskId: input.task_id }
        );
      }

      // Check if task is already claimed
      if (existingTask.status === 'claimed' || existingTask.status === 'in_progress') {
        throw new ConflictError(
          `Task ${input.task_id} is already claimed by ${existingTask.assignee}`,
          'TASK_ALREADY_CLAIMED',
          { 
            taskId: input.task_id,
            currentAssignee: existingTask.assignee,
            currentStatus: existingTask.status,
          }
        );
      }

      // Check if task is in a claimable state
      if (existingTask.status !== 'todo') {
        throw new ConflictError(
          `Task ${input.task_id} cannot be claimed in status '${existingTask.status}'`,
          'TASK_NOT_CLAIMABLE',
          { 
            taskId: input.task_id,
            currentStatus: existingTask.status,
            claimableStatuses: ['todo'],
          }
        );
      }

      // Update task to claimed status
      const updatedTask = await prisma.task.update({
        where: { id: input.task_id },
        data: {
          status: 'claimed',
          assignee: input.assignee,
          updatedAt: new Date(),
        },
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          assignee: true,
          repo: true,
          acceptanceCriteria: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      // Log the claim event
      await prisma.event.create({
        data: {
          taskId: input.task_id,
          actor: input.assignee,
          action: 'task_claimed',
          payload: JSON.stringify({
            assignee: input.assignee,
            previous_status: existingTask.status,
            new_status: 'claimed',
            timestamp: new Date().toISOString(),
          }),
        },
      });

      return updatedTask;
    });

    if (isFailure(claimResult)) {
      logger.error('Failed to claim task', {
        requestId,
        taskId: input.task_id,
        error: claimResult.error,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: {
                type: claimResult.error.type,
                message: claimResult.error.message,
                code: claimResult.error.code,
                details: claimResult.error.details,
              },
            }),
          },
        ],
        isError: true,
      };
    }

    const task = claimResult.data;
    
    // Parse acceptance criteria from JSON string
    let acceptanceCriteria: string[] = [];
    try {
      acceptanceCriteria = JSON.parse(task.acceptanceCriteria || '[]');
    } catch (error) {
      logger.warn('Failed to parse acceptance criteria', { 
        taskId: task.id,
        acceptanceCriteria: task.acceptanceCriteria,
      });
    }

    const response: ClaimTaskResponse = {
      task_id: task.id,
      title: task.title,
      description: task.description,
      status: task.status as any,
      assignee: task.assignee!,  // We know it's not null since we just set it
      repo: task.repo ?? undefined,
      acceptance_criteria: acceptanceCriteria,
      claimed_at: task.updatedAt.toISOString(),
    };

    logger.info('Task claimed successfully', {
      requestId,
      taskId: task.id,
      assignee: task.assignee,
      status: task.status,
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
    logger.error('Unexpected error in claim_task', {
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
              message: 'Internal server error while claiming task',
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
