/**
 * submit_spec MCP Tool
 *
 * Creates a new task with structured requirements
 */

import { Logger } from 'pino';
import { validateInput, SubmitSpecSchema, SubmitSpecInput } from '../lib/validation.js';
import { withRetry, prisma } from '../lib/database.js';
import { ToolResult, SubmitSpecResponse, serializeForDatabase } from '../types/mcp.js';
import { success, failure, isFailure } from '../types/errors.js';

/**
 * Submit a new task specification
 */
export async function submitSpecTool(args: unknown, logger: Logger): Promise<ToolResult> {
  logger.debug('Processing submit_spec request', { args });

  // Validate input
  const validationResult = validateInput(SubmitSpecSchema, args);
  if (isFailure(validationResult)) {
    logger.warn('Input validation failed', {
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
  logger.info('Creating new task', {
    title: input.title,
    repo: input.repo,
    criteriaCount: input.acceptance_criteria.length,
  });

  // Create task in database
  const createResult = await withRetry(async () => {
    return await prisma.task.create({
      data: {
        title: input.title,
        description: input.description,
        repo: input.repo || null,
        acceptanceCriteria: serializeForDatabase(input.acceptance_criteria),
        status: 'todo',
      },
    });
  });

  if (isFailure(createResult)) {
    logger.error('Failed to create task', {
      error: createResult.error,
      input,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: {
              type: createResult.error.type,
              message: 'Failed to create task',
              code: createResult.error.code,
              details: createResult.error.details,
            },
          }),
        },
      ],
      isError: true,
    };
  }

  const task = createResult.data;

  // Log the event
  const eventResult = await withRetry(async () => {
    return await prisma.event.create({
      data: {
        taskId: task.id,
        actor: 'system', // TODO: Get actual user from auth context
        action: 'submit_spec',
        payload: serializeForDatabase({
          title: input.title,
          repo: input.repo,
          criteriaCount: input.acceptance_criteria.length,
        }),
        success: true,
      },
    });
  });

  if (isFailure(eventResult)) {
    logger.warn('Failed to log event, but task was created successfully', {
      taskId: task.id,
      error: eventResult.error,
    });
  }

  const response: SubmitSpecResponse = {
    task_id: task.id,
    title: task.title,
    status: task.status,
    created_at: task.createdAt.toISOString(),
  };

  logger.info('Task created successfully', {
    taskId: task.id,
    title: task.title,
  });

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(response),
      },
    ],
  };
}
