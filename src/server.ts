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

import { config } from './config/env.js';
import { logger, createChildLogger } from './lib/logger.js';
import { initializeDatabase, closeDatabase } from './lib/database.js';
import { ToolResult } from './types/mcp.js';

// Import tool handlers
import { submitSpecTool } from './tools/submit-spec.js';
import { listTasksTool } from './tools/list-tasks.js';

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
      ],
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
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

    // Create and start server
    const server = await createServer();
    const transport = new StdioServerTransport();
    
    await server.connect(transport);
    
    serverLogger.info('TaskHub MCP Server started successfully');

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
  main().catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}
