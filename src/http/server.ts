/**
 * HTTP server implementation for TaskHub MCP (Phase 2.5)
 * 
 * Provides HTTP transport alongside stdio transport for ChatGPT integration.
 */

import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { config, derivedConfig } from '../config/env.js';
import { logger } from '../lib/logger.js';
import {
  extractTokenFromHeader,
  verifyToken,
  generateDemoToken,
  AuthenticationError,
  AuthorizationError,
  UserContext
} from '../lib/auth.js';
import {
  checkIdempotencyKey,
  storeIdempotencyResponse,
  validateIdempotencyKey,
  IdempotencyConflictError,
  IdempotencyRequest
} from '../lib/idempotency.js';
import { submitSpecTool } from '../tools/submit-spec.js';
import { listTasksTool } from '../tools/list-tasks.js';
import { claimTaskTool } from '../tools/claim-task.js';
import { startBranchTool } from '../tools/start-branch.js';
import { pushPatchTool } from '../tools/push-patch.js';
import { openPrTool } from '../tools/open-pr.js';
import { postReviewTool } from '../tools/post-review.js';
import { validatePermissions } from '../lib/auth.js';

// Extend Fastify request with user context
declare module 'fastify' {
  interface FastifyRequest {
    user?: UserContext;
    idempotencyKey?: string;
  }
}

/**
 * Create and configure Fastify server
 */
export async function createHttpServer(): Promise<FastifyInstance> {
  const server = Fastify({
    logger: false, // Use our custom logger
    trustProxy: true,
    requestIdHeader: config.REQUEST_ID_HEADER,
  });

  // Register plugins
  await registerPlugins(server);
  
  // Register middleware
  await registerMiddleware(server);
  
  // Register routes
  await registerRoutes(server);
  
  // Error handling
  registerErrorHandlers(server);
  
  return server;
}

/**
 * Register Fastify plugins
 */
async function registerPlugins(server: FastifyInstance): Promise<void> {
  // CORS
  await server.register(cors, {
    origin: derivedConfig.isDevelopment ? true : false, // Allow all origins in dev
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-ID',
      'Idempotency-Key',
    ],
  });

  // Security headers
  await server.register(helmet);

  // Rate limiting
  await server.register(rateLimit, {
    max: 100, // requests
    timeWindow: '1 minute',
    errorResponseBuilder: (request, context) => ({
      error: 'Rate limit exceeded',
      message: `Too many requests. Limit: ${context.max} requests per minute`,
      statusCode: 429,
    }),
  });
}

/**
 * Register middleware
 */
async function registerMiddleware(server: FastifyInstance): Promise<void> {
  // Request logging
  server.addHook('onRequest', async (request, reply) => {
    logger.info('HTTP request', {
      method: request.method,
      url: request.url,
      userAgent: request.headers['user-agent'],
      requestId: request.id,
      ip: request.ip,
    });
  });

  // Authentication middleware
  server.addHook('preHandler', async (request, reply) => {
    // Skip auth for health check and public endpoints
    if (request.url === '/healthz' || request.url === '/' || request.url === '/auth/demo-token') {
      return;
    }

    const authHeader = request.headers.authorization;
    const token = extractTokenFromHeader(authHeader);

    if (!token) {
      throw new AuthenticationError('Missing authorization token', 'MISSING_TOKEN');
    }

    try {
      const user = verifyToken(token);
      request.user = user;

      logger.debug('User authenticated', {
        userId: user.userId,
        username: user.username,
        requestId: request.id,
      });
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }
      throw new AuthenticationError('Invalid token', 'INVALID_TOKEN');
    }
  });

  // Idempotency middleware
  server.addHook('preHandler', async (request, reply) => {
    // Only apply idempotency to POST/PUT/PATCH requests
    if (!['POST', 'PUT', 'PATCH'].includes(request.method)) {
      return;
    }

    // Skip for health check and auth endpoints
    if (request.url === '/healthz' || request.url === '/auth/demo-token') {
      return;
    }

    const idempotencyKey = request.headers['idempotency-key'] as string;
    
    // Check if idempotency is required
    if (config.IDEMPOTENCY_REQUIRED && !idempotencyKey) {
      throw new Error('Idempotency-Key header is required for this operation');
    }

    if (idempotencyKey) {
      if (!validateIdempotencyKey(idempotencyKey)) {
        throw new Error('Invalid Idempotency-Key format');
      }

      request.idempotencyKey = idempotencyKey;

      // Check for existing response
      const idempotencyRequest: IdempotencyRequest = {
        key: idempotencyKey,
        method: request.method,
        path: request.url,
        userId: request.user?.userId || undefined,
        body: request.body,
      };

      try {
        const existingResponse = await checkIdempotencyKey(idempotencyRequest);
        
        if (existingResponse) {
          // Return stored response
          reply.code(existingResponse.statusCode);
          reply.header('X-Idempotency-Replay', 'true');
          return reply.send(existingResponse.response);
        }
      } catch (error) {
        if (error instanceof IdempotencyConflictError) {
          reply.code(409);
          return reply.send({
            error: 'Idempotency conflict',
            message: error.message,
            code: 'IDEMPOTENCY_CONFLICT',
          });
        }
        throw error;
      }
    }
  });

  // Response logging and idempotency storage
  server.addHook('onSend', async (request, reply, payload) => {
    const statusCode = reply.statusCode;
    const responseTime = Date.now() - (request as any).startTime || 0;

    logger.info('HTTP response', {
      method: request.method,
      url: request.url,
      statusCode,
      responseTime: `${responseTime}ms`,
      requestId: request.id,
      userId: request.user?.userId,
    });

    // Store idempotency response for successful operations
    if (request.idempotencyKey && statusCode >= 200 && statusCode < 300) {
      const idempotencyRequest: IdempotencyRequest = {
        key: request.idempotencyKey,
        method: request.method,
        path: request.url,
        userId: request.user?.userId || undefined,
        body: request.body,
      };

      try {
        const responseData = typeof payload === 'string' ? JSON.parse(payload) : payload;
        await storeIdempotencyResponse(idempotencyRequest, responseData, statusCode);
      } catch (error) {
        logger.error('Failed to store idempotency response', {
          key: request.idempotencyKey,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return payload;
  });
}

/**
 * Register error handlers
 */
function registerErrorHandlers(server: FastifyInstance): void {
  server.setErrorHandler((error, request, reply) => {
    const requestId = request.id;
    
    // Authentication errors
    if (error instanceof AuthenticationError) {
      logger.warn('Authentication error', {
        error: error.message,
        code: error.code,
        requestId,
        url: request.url,
      });
      
      return reply.code(error.statusCode).send({
        error: 'Authentication failed',
        message: error.message,
        code: error.code,
        requestId,
      });
    }

    // Authorization errors
    if (error instanceof AuthorizationError) {
      logger.warn('Authorization error', {
        error: error.message,
        code: error.code,
        requestId,
        userId: request.user?.userId,
        url: request.url,
      });
      
      return reply.code(error.statusCode).send({
        error: 'Authorization failed',
        message: error.message,
        code: error.code,
        requestId,
      });
    }

    // Validation errors
    if (error.validation) {
      logger.warn('Validation error', {
        error: error.message,
        validation: error.validation,
        requestId,
        url: request.url,
      });
      
      return reply.code(400).send({
        error: 'Validation failed',
        message: error.message,
        details: error.validation,
        requestId,
      });
    }

    // Rate limit errors
    if (error.statusCode === 429) {
      return reply.code(429).send({
        error: 'Rate limit exceeded',
        message: error.message,
        requestId,
      });
    }

    // Generic server errors
    logger.error('HTTP server error', {
      error: error.message,
      stack: error.stack,
      requestId,
      url: request.url,
      method: request.method,
      userId: request.user?.userId,
    });

    return reply.code(500).send({
      error: 'Internal server error',
      message: derivedConfig.isDevelopment ? error.message : 'An unexpected error occurred',
      requestId,
    });
  });

  // 404 handler
  server.setNotFoundHandler((request, reply) => {
    logger.warn('Route not found', {
      method: request.method,
      url: request.url,
      requestId: request.id,
    });

    reply.code(404).send({
      error: 'Not found',
      message: `Route ${request.method} ${request.url} not found`,
      requestId: request.id,
    });
  });
}

/**
 * Start the HTTP server
 */
export async function startHttpServer(): Promise<FastifyInstance> {
  const server = await createHttpServer();
  
  try {
    await server.listen({
      port: config.PORT,
      host: '0.0.0.0',
    });
    
    logger.info('HTTP server started', {
      port: config.PORT,
      basePath: config.BASE_PATH,
      environment: config.NODE_ENV,
    });
    
    return server;
  } catch (error) {
    logger.error('Failed to start HTTP server', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      port: config.PORT,
    });
    throw error;
  }
}

/**
 * Helper function to handle MCP tool results
 */
function handleToolResult(result: any, reply: FastifyReply) {
  if (result.isError) {
    reply.code(400);
    return result.content?.[0] || { error: 'Unknown error' };
  }

  return JSON.parse(result.content?.[0]?.text || '{}');
}

/**
 * Register HTTP routes for MCP tools
 */
async function registerRoutes(server: FastifyInstance): Promise<void> {
  // Health check endpoint
  server.get('/healthz', async (request, reply) => {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      uptime: process.uptime(),
    };
  });

  // Development token endpoint (no auth required, only in development)
  if (config.NODE_ENV === 'development') {
    server.post('/auth/demo-token', async (request, reply) => {
      const token = generateDemoToken();
      return {
        token,
        type: 'Bearer',
        expiresIn: `${config.JWT_TTL_MIN}m`,
        user: {
          userId: 'demo-user-1',
          username: 'demo-user',
          email: 'demo@taskhub.local',
          roles: ['developer', 'admin'],
        },
      };
    });
  }

  // Root endpoint
  server.get('/', async (request, reply) => {
    return {
      name: 'TaskHub MCP Server',
      version: '1.0.0',
      description: 'HTTP transport for TaskHub MCP tools',
      endpoints: {
        health: '/healthz',
        tasks: {
          submit: 'POST /mcp/tasks',
          list: 'GET /mcp/tasks',
          claim: 'POST /mcp/tasks/:id/claim',
        },
        github: {
          branch: 'POST /mcp/tasks/:id/branch',
          patch: 'POST /mcp/tasks/:id/patch',
          pr: 'POST /mcp/tasks/:id/pr',
          review: 'POST /mcp/tasks/:id/review',
        },
      },
    };
  });

  // MCP tool endpoints
  const basePath = config.BASE_PATH;

  // submit_spec -> POST /mcp/tasks
  server.post(`${basePath}/tasks`, async (request, reply) => {
    validatePermissions(request.user!, 'submit_spec');

    const result = await submitSpecTool(request.body as any, logger);
    return handleToolResult(result, reply);
  });

  // list_tasks -> GET /mcp/tasks
  server.get(`${basePath}/tasks`, async (request, reply) => {
    validatePermissions(request.user!, 'list_tasks');

    // Convert query parameters to proper types
    const query = request.query as any;
    const processedQuery = {
      ...query,
      limit: query.limit ? parseInt(query.limit, 10) : undefined,
      offset: query.offset ? parseInt(query.offset, 10) : undefined,
    };

    const result = await listTasksTool(processedQuery, logger);
    return handleToolResult(result, reply);
  });

  // claim_task -> POST /mcp/tasks/:id/claim
  server.post(`${basePath}/tasks/:id/claim`, async (request, reply) => {
    validatePermissions(request.user!, 'claim_task');

    const { id } = request.params as { id: string };
    const body = request.body as any;

    const result = await claimTaskTool({
      task_id: parseInt(id, 10),
      ...body,
    }, logger);

    return handleToolResult(result, reply);
  });

  // start_branch -> POST /mcp/tasks/:id/branch
  server.post(`${basePath}/tasks/:id/branch`, async (request, reply) => {
    validatePermissions(request.user!, 'start_branch');

    const { id } = request.params as { id: string };
    const body = request.body as any;

    const result = await startBranchTool({
      task_id: parseInt(id, 10),
      ...body,
    }, logger);

    return handleToolResult(result, reply);
  });

  // push_patch -> POST /mcp/tasks/:id/patch
  server.post(`${basePath}/tasks/:id/patch`, async (request, reply) => {
    validatePermissions(request.user!, 'push_patch');

    const { id } = request.params as { id: string };
    const body = request.body as any;

    const result = await pushPatchTool({
      task_id: parseInt(id, 10),
      ...body,
    }, logger);

    return handleToolResult(result, reply);
  });

  // open_pr -> POST /mcp/tasks/:id/pr
  server.post(`${basePath}/tasks/:id/pr`, async (request, reply) => {
    validatePermissions(request.user!, 'open_pr');

    const { id } = request.params as { id: string };
    const body = request.body as any;

    const result = await openPrTool({
      task_id: parseInt(id, 10),
      ...body,
    }, logger);

    return handleToolResult(result, reply);
  });

  // post_review -> POST /mcp/tasks/:id/review
  server.post(`${basePath}/tasks/:id/review`, async (request, reply) => {
    validatePermissions(request.user!, 'post_review');

    const { id } = request.params as { id: string };
    const body = request.body as any;

    const result = await postReviewTool({
      task_id: parseInt(id, 10),
      ...body,
    }, logger);

    return handleToolResult(result, reply);
  });

  // Alternative review endpoint that accepts PR number directly
  server.post(`${basePath}/reviews`, async (request, reply) => {
    validatePermissions(request.user!, 'post_review');

    const result = await postReviewTool(request.body as any, logger);
    return handleToolResult(result, reply);
  });
}
