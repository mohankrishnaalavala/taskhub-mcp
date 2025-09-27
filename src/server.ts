#!/usr/bin/env node

/**
 * TaskHub MCP Server
 * A Model Context Protocol server for ChatGPT ↔ Augment ↔ GitHub workflow
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';

import { logger } from './lib/logger.js';
import { initializeDatabase } from './lib/database.js';
import { config } from './config/env.js';
import { 
  submitSpecTool,
  listTasksTool,
  claimTaskTool,
  startBranchTool,
  pushPatchTool,
  openPrTool,
  postReviewTool
} from './tools/index.js';

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
    return {
      tools: [
        {
          name: 'submit_spec',
          description: 'Submit a new task specification with requirements and acceptance criteria',
          inputSchema: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Task title' },
              description: { type: 'string', description: 'Detailed task description' },
              repo: { type: 'string', description: 'GitHub repository (owner/repo)' },
              acceptance_criteria: {
                type: 'array',
                items: { type: 'string' },
                description: 'List of acceptance criteria'
              },
              priority: {
                type: 'string',
                enum: ['low', 'medium', 'high', 'urgent'],
                default: 'medium'
              }
            },
            required: ['title', 'description', 'acceptance_criteria']
          }
        },
        {
          name: 'list_tasks',
          description: 'List tasks with optional filtering',
          inputSchema: {
            type: 'object',
            properties: {
              status: {
                type: 'string',
                enum: ['todo', 'in_progress', 'review', 'done'],
                description: 'Filter by task status'
              },
              assignee: { type: 'string', description: 'Filter by assignee' },
              limit: { type: 'number', default: 10, description: 'Maximum number of tasks to return' },
              offset: { type: 'number', default: 0, description: 'Number of tasks to skip' }
            }
          }
        },
        {
          name: 'claim_task',
          description: 'Claim a task for implementation',
          inputSchema: {
            type: 'object',
            properties: {
              task_id: { type: 'number', description: 'Task ID to claim' },
              assignee: { type: 'string', description: 'Username of the assignee' }
            },
            required: ['task_id', 'assignee']
          }
        },
        {
          name: 'start_branch',
          description: 'Create a new Git branch for the task',
          inputSchema: {
            type: 'object',
            properties: {
              task_id: { type: 'number', description: 'Task ID' },
              repo: { type: 'string', description: 'GitHub repository (owner/repo)' },
              base_branch: { type: 'string', default: 'main', description: 'Base branch to branch from' }
            },
            required: ['task_id', 'repo']
          }
        },
        {
          name: 'push_patch',
          description: 'Push code changes to the task branch',
          inputSchema: {
            type: 'object',
            properties: {
              task_id: { type: 'number', description: 'Task ID' },
              files: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    path: { type: 'string', description: 'File path relative to repo root' },
                    content: { type: 'string', description: 'File content (plain text)' }
                  },
                  required: ['path', 'content']
                },
                description: 'Files to create or update'
              },
              message: { type: 'string', description: 'Commit message' }
            },
            required: ['task_id', 'files', 'message']
          }
        },
        {
          name: 'open_pr',
          description: 'Open a pull request for the task',
          inputSchema: {
            type: 'object',
            properties: {
              task_id: { type: 'number', description: 'Task ID' },
              repo: { type: 'string', description: 'GitHub repository (owner/repo)' },
              title: { type: 'string', description: 'PR title (optional, defaults to task title)' },
              body: { type: 'string', description: 'PR description (optional)' },
              base: { type: 'string', default: 'main', description: 'Target branch' },
              draft: { type: 'boolean', default: false, description: 'Create as draft PR' }
            },
            required: ['task_id', 'repo']
          }
        },
        {
          name: 'post_review',
          description: 'Post a code review on the pull request',
          inputSchema: {
            type: 'object',
            properties: {
              task_id: { type: 'number', description: 'Task ID' },
              body: { type: 'string', description: 'Review comment' },
              event: {
                type: 'string',
                enum: ['COMMENT', 'APPROVE', 'REQUEST_CHANGES'],
                description: 'Review action'
              }
            },
            required: ['task_id', 'body', 'event']
          }
        }
      ]
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'submit_spec':
          return await submitSpecTool(args, logger);
        
        case 'list_tasks':
          return await listTasksTool(args, logger);
        
        case 'claim_task':
          return await claimTaskTool(args, logger);
        
        case 'start_branch':
          return await startBranchTool(args, logger);
        
        case 'push_patch':
          return await pushPatchTool(args, logger);
        
        case 'open_pr':
          return await openPrTool(args, logger);
        
        case 'post_review':
          return await postReviewTool(args, logger);
        
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Tool ${name} failed`, { error: errorMessage, args });
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${errorMessage}`
          }
        ],
        isError: true
      };
    }
  });

  return server;
}

/**
 * Main function
 */
async function main(): Promise<void> {
  try {
    // Initialize database
    await initializeDatabase();
    logger.info('Database initialized');

    // Create MCP server
    const server = await createServer();
    
    // Use stdio transport for MCP (ChatGPT and Augment both use stdio)
    const transport = new StdioServerTransport();
    
    await server.connect(transport);
    logger.info('TaskHub MCP Server started with stdio transport');
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to start server', { error: errorMessage });
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

// Start the server
main().catch((error) => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  logger.error('Unhandled error', { error: errorMessage });
  process.exit(1);
});
