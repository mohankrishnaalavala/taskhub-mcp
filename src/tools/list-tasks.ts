/**
 * list_tasks MCP Tool
 * 
 * Lists tasks with optional filtering
 */

import { Logger } from 'pino';
import { validateInput, ListTasksSchema, ListTasksInput } from '../lib/validation.js';
import { withRetry, prisma } from '../lib/database.js';
import { ToolResult, ListTasksResponse, deserializeFromDatabase } from '../types/mcp.js';
import { isFailure } from '../types/errors.js';

/**
 * List tasks with optional filtering
 */
export async function listTasksTool(args: unknown, logger: Logger): Promise<ToolResult> {
  logger.debug('Processing list_tasks request', { args });

  // Validate input
  const validationResult = validateInput(ListTasksSchema, args);
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
  logger.info('Listing tasks', { 
    status: input.status,
    assignee: input.assignee,
    repo: input.repo,
    limit: input.limit,
    offset: input.offset,
  });

  // Build where clause for filtering
  const where: any = {};
  if (input.status) {
    where.status = input.status;
  }
  if (input.assignee) {
    where.assignee = input.assignee;
  }
  if (input.repo) {
    where.repo = input.repo;
  }

  // Get tasks with pagination
  const tasksResult = await withRetry(async () => {
    return await prisma.task.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: input.limit || 50,
      skip: input.offset || 0,
    });
  });

  if (isFailure(tasksResult)) {
    logger.error('Failed to fetch tasks', { 
      error: tasksResult.error,
      input,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: {
              type: tasksResult.error.type,
              message: 'Failed to fetch tasks',
              code: tasksResult.error.code,
              details: tasksResult.error.details,
            },
          }),
        },
      ],
      isError: true,
    };
  }

  // Get total count for pagination
  const countResult = await withRetry(async () => {
    return await prisma.task.count({ where });
  });

  if (isFailure(countResult)) {
    logger.error('Failed to count tasks', { 
      error: countResult.error,
      input,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: {
              type: countResult.error.type,
              message: 'Failed to count tasks',
              code: countResult.error.code,
              details: countResult.error.details,
            },
          }),
        },
      ],
      isError: true,
    };
  }

  const tasks = tasksResult.data;
  const total = countResult.data;

  // Transform tasks for response
  const transformedTasks = tasks.map(task => {
    const taskData: any = {
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      acceptance_criteria: deserializeFromDatabase<string[]>(task.acceptanceCriteria),
      created_at: task.createdAt.toISOString(),
      updated_at: task.updatedAt.toISOString(),
    };

    if (task.assignee) taskData.assignee = task.assignee;
    if (task.repo) taskData.repo = task.repo;
    if (task.branch) taskData.branch = task.branch;

    return taskData;
  });

  const response: ListTasksResponse = {
    tasks: transformedTasks,
    total,
    limit: input.limit || 50,
    offset: input.offset || 0,
  };

  logger.info('Tasks listed successfully', {
    count: tasks.length,
    total,
    filters: { status: input.status, assignee: input.assignee, repo: input.repo },
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
