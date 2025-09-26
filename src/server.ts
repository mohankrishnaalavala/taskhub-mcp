#!/usr/bin/env node

/**
 * TaskHub MCP Server
 *
 * A Model Context Protocol server that enables ChatGPT ↔ Augment ↔ GitHub workflow
 * for rapid product development.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';

import { config, derivedConfig } from './config/env.js';
import { logger, createChildLogger } from './lib/logger.js';
import { initializeDatabase, closeDatabase } from './lib/database.js';
import { ToolResult } from './types/mcp.js';
import { startHttpServer } from './http/server.js';

// Import tool handlers
import { submitSpecTool } from './tools/submit-spec.js';
import { listTasksTool } from './tools/list-tasks.js';
import { claimTaskTool } from './tools/claim-task.js';
import { startBranchTool } from './tools/start-branch.js';
import { pushPatchTool } from './tools/push-patch.js';
import { openPrTool } from './tools/open-pr.js';
import { postReviewTool } from './tools/post-review.js';

const serverLogger = createChildLogger({ component: 'mcp-server' });

/**
 * Create and configure the MCP server
 */
async function createServer(): Promise<Server> {
  const server = new Server(
    {
      name: 'taskhub-mcp',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    serverLogger.debug('Listing available tools');

    return {
      tools: [
        {
          name: 'submit_spec',
          description: 'Create a new task with structured requirements',
          inputSchema: {
            type: 'object',
            required: ['title', 'description', 'acceptance_criteria'],
            properties: {
              title: {
                type: 'string',
                minLength: 3,
                maxLength: 140,
                description: 'Task title (3-140 characters)',
              },
              description: {
                type: 'string',
                minLength: 10,
                maxLength: 5000,
                description: 'Detailed task description (10-5000 characters)',
              },
              acceptance_criteria: {
                type: 'array',
                items: { type: 'string' },
                minItems: 1,
                maxItems: 20,
                description: 'List of acceptance criteria (1-20 items)',
              },
              repo: {
                type: 'string',
                pattern: '^[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+$',
                description: 'Repository in format owner/repo (optional)',
              },
            },
          },
        },
        {
          name: 'list_tasks',
          description: 'List tasks with optional filtering',
          inputSchema: {
            type: 'object',
            properties: {
              status: {
                type: 'string',
                enum: ['todo', 'claimed', 'in_progress', 'review', 'done'],
                description: 'Filter by task status',
              },
              assignee: {
                type: 'string',
                description: 'Filter by assignee',
              },
              repo: {
                type: 'string',
                pattern: '^[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+$',
                description: 'Filter by repository',
              },
              limit: {
                type: 'number',
                minimum: 1,
                maximum: 100,
                default: 50,
                description: 'Maximum number of tasks to return',
              },
              offset: {
                type: 'number',
                minimum: 0,
                default: 0,
                description: 'Number of tasks to skip',
              },
            },
          },
        },
        {
          name: 'claim_task',
          description: 'Assign a task to a user and update status to claimed',
          inputSchema: {
            type: 'object',
            required: ['task_id', 'assignee'],
            properties: {
              task_id: {
                type: 'number',
                description: 'ID of the task to claim',
              },
              assignee: {
                type: 'string',
                minLength: 1,
                maxLength: 100,
                description: 'Username of the person claiming the task',
              },
            },
          },
        },
        {
          name: 'start_branch',
          description: 'Create a new Git branch for task work',
          inputSchema: {
            type: 'object',
            required: ['task_id'],
            properties: {
              task_id: {
                type: 'number',
                description: 'ID of the task to create a branch for',
              },
              repo: {
                type: 'string',
                pattern: '^[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+$',
                description: 'Repository in format owner/repo (optional if task has repo)',
              },
              branch_name: {
                type: 'string',
                minLength: 1,
                maxLength: 100,
                description: 'Custom branch name (optional, auto-generated if not provided)',
              },
              base_branch: {
                type: 'string',
                minLength: 1,
                maxLength: 100,
                description: 'Base branch to create from (optional, defaults to main/master)',
              },
              dry_run: {
                type: 'boolean',
                default: false,
                description: 'If true, simulate the operation without making changes',
              },
            },
          },
        },
        {
          name: 'push_patch',
          description: 'Upload code changes to the task branch',
          inputSchema: {
            type: 'object',
            required: ['task_id', 'branch_name', 'files'],
            properties: {
              task_id: {
                type: 'number',
                description: 'ID of the task to push changes for',
              },
              branch_name: {
                type: 'string',
                minLength: 1,
                maxLength: 100,
                description: 'Branch name to push changes to',
              },
              repo: {
                type: 'string',
                pattern: '^[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+$',
                description: 'Repository in format owner/repo (optional if task has repo)',
              },
              files: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['path', 'content'],
                  properties: {
                    path: {
                      type: 'string',
                      minLength: 1,
                      maxLength: 500,
                      description: 'File path relative to repository root',
                    },
                    content: {
                      type: 'string',
                      description: 'File content',
                    },
                    encoding: {
                      type: 'string',
                      enum: ['utf-8', 'base64'],
                      default: 'utf-8',
                      description: 'Content encoding',
                    },
                  },
                },
                minItems: 1,
                maxItems: 50,
                description: 'Array of files to push (1-50 files)',
              },
              commit_message: {
                type: 'string',
                minLength: 1,
                maxLength: 500,
                description: 'Custom commit message (optional, auto-generated if not provided)',
              },
              dry_run: {
                type: 'boolean',
                default: false,
                description: 'If true, simulate the operation without making changes',
              },
            },
          },
        },
        {
          name: 'open_pr',
          description:
            'Create a GitHub pull request with auto-generated checklist from acceptance criteria',
          inputSchema: {
            type: 'object',
            required: ['task_id'],
            properties: {
              task_id: {
                type: 'number',
                description: 'ID of the task to create a PR for',
              },
              repo: {
                type: 'string',
                pattern: '^[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+$',
                description: 'Repository in format owner/repo (optional if task has repo)',
              },
              title: {
                type: 'string',
                minLength: 1,
                maxLength: 200,
                description: 'Custom PR title (optional, auto-generated if not provided)',
              },
              draft: {
                type: 'boolean',
                default: true,
                description: 'Whether to create a draft PR (default: true)',
              },
              force: {
                type: 'boolean',
                default: false,
                description: 'Force create non-draft PR even if policy requires draft',
              },
              dry_run: {
                type: 'boolean',
                default: false,
                description: 'If true, simulate the operation without making changes',
              },
            },
          },
        },
        {
          name: 'post_review',
          description: 'Post a review on a GitHub pull request with block/unblock functionality',
          inputSchema: {
            type: 'object',
            required: ['notes'],
            properties: {
              task_id: {
                type: 'number',
                description: 'ID of the task to review (either task_id or pr_number required)',
              },
              pr_number: {
                type: 'number',
                description: 'PR number to review (either task_id or pr_number required)',
              },
              repo: {
                type: 'string',
                pattern: '^[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+$',
                description: 'Repository in format owner/repo (optional if task has repo)',
              },
              notes: {
                type: 'string',
                minLength: 1,
                maxLength: 2000,
                description: 'Review notes and feedback (1-2000 characters)',
              },
              block: {
                type: 'boolean',
                default: false,
                description: 'Whether this review blocks the PR from being merged',
              },
              dry_run: {
                type: 'boolean',
                default: false,
                description: 'If true, simulate the operation without making changes',
              },
            },
          },
        },
      ],
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async request => {
    const { name, arguments: args } = request.params;

    const toolLogger = createChildLogger({
      component: 'tool-handler',
      tool: name,
      requestId: Math.random().toString(36).substring(7),
    });

    toolLogger.info('Tool call received', { name, args });

    try {
      let result: ToolResult;

      switch (name) {
        case 'submit_spec':
          result = await submitSpecTool(args, toolLogger);
          break;

        case 'list_tasks':
          result = await listTasksTool(args, toolLogger);
          break;

        case 'claim_task':
          result = await claimTaskTool(args, toolLogger);
          break;

        case 'start_branch':
          result = await startBranchTool(args, toolLogger);
          break;

        case 'push_patch':
          result = await pushPatchTool(args, toolLogger);
          break;

        case 'open_pr':
          result = await openPrTool(args, toolLogger);
          break;

        case 'post_review':
          result = await postReviewTool(args, toolLogger);
          break;

        default:
          toolLogger.error('Unknown tool requested', { name });
          result = {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: {
                    type: 'not_found',
                    message: `Unknown tool: ${name}`,
                    code: 'TOOL_NOT_FOUND',
                  },
                }),
              },
            ],
            isError: true,
          };
      }

      toolLogger.info('Tool call completed', {
        name,
        success: !result.isError,
      });

      // Return the result in the correct MCP format
      const mcpResult: CallToolResult = {
        content: result.content,
        isError: result.isError,
      };

      return mcpResult;
    } catch (error) {
      toolLogger.error('Tool call failed with unexpected error', {
        name,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      const errorResult: CallToolResult = {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: {
                type: 'internal',
                message: 'Internal server error',
                code: 'INTERNAL_ERROR',
              },
            }),
          },
        ],
        isError: true,
      };

      return errorResult;
    }
  });

  return server;
}

/**
 * Main server startup function
 */
async function main() {
  try {
    serverLogger.info('Starting TaskHub MCP Server', {
      version: '1.0.0',
      nodeEnv: config.NODE_ENV,
      dryRun: config.DRY_RUN,
    });

    // Initialize database
    const dbResult = await initializeDatabase();
    if (!dbResult.success) {
      serverLogger.error('Failed to initialize database', { error: dbResult.error });
      process.exit(1);
    }

    // Determine which transports to start
    const transports = derivedConfig.transports;
    const servers: any[] = [];

    // Start stdio transport (default)
    if (transports.includes('stdio')) {
      const mcpServer = await createServer();
      const transport = new StdioServerTransport();
      await mcpServer.connect(transport);
      servers.push({ type: 'stdio', server: mcpServer });
      serverLogger.info('MCP stdio transport started');
    }

    // Start HTTP transport (Phase 2.5)
    if (transports.includes('http')) {
      const httpServer = await startHttpServer();
      servers.push({ type: 'http', server: httpServer });
      serverLogger.info('HTTP transport started', { port: config.PORT });
    }

    if (servers.length === 0) {
      throw new Error('No transports configured. Set TRANSPORTS environment variable.');
    }

    serverLogger.info('TaskHub MCP Server started successfully', {
      transports: transports,
      port: transports.includes('http') ? config.PORT : undefined,
    });

    // Graceful shutdown handling
    const shutdown = async () => {
      serverLogger.info('Shutting down TaskHub MCP Server');
      await closeDatabase();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (error) {
    serverLogger.error('Failed to start server', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  }
}

// Start the server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}
