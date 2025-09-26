# TaskHub MCP Server - HTTP API Documentation

## Overview

The TaskHub MCP Server supports both **stdio** (for MCP clients) and **HTTP** transports (for ChatGPT and web clients). This document covers the HTTP API introduced in Phase 2.5.

## 🚀 Quick Start

### 1. Start HTTP Server

```bash
# Start with HTTP transport
TRANSPORTS=http npm start

# Start with both stdio and HTTP
TRANSPORTS=stdio,http npm start

# Production with custom port
TRANSPORTS=http PORT=8080 npm start
```

### 2. Authentication

All API endpoints (except `/healthz` and `/`) require JWT authentication:

```bash
# Get a token (implementation-specific)
TOKEN="your-jwt-token-here"

# Use in requests
curl -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     http://localhost:3000/mcp/tasks
```

### 3. Basic Request

```bash
# Create a task
curl -X POST http://localhost:3000/mcp/tasks \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Fix login bug",
    "description": "Users cannot log in with special characters",
    "acceptance_criteria": ["Login works", "Tests pass"],
    "repo": "myorg/myapp"
  }'
```

## 🔐 Authentication

### JWT Token Structure

```json
{
  "userId": "user-123",
  "username": "developer",
  "email": "dev@company.com",
  "roles": ["developer", "reviewer"],
  "permissions": ["tasks:read", "tasks:write", "github:read", "github:write"],
  "iat": 1640995200,
  "exp": 1640998800,
  "iss": "taskhub-mcp",
  "aud": "taskhub-api"
}
```

### Required Permissions

| Endpoint | Permission Required |
|----------|-------------------|
| `GET /mcp/tasks` | `tasks:read` |
| `POST /mcp/tasks` | `tasks:write` |
| `POST /mcp/tasks/:id/claim` | `tasks:write` |
| `POST /mcp/tasks/:id/branch` | `github:write` |
| `POST /mcp/tasks/:id/patch` | `github:write` |
| `POST /mcp/tasks/:id/pr` | `github:write` |
| `POST /mcp/tasks/:id/review` | `github:write` |

## 🔄 Idempotency

### Idempotency Keys

Use `Idempotency-Key` header to ensure requests are processed only once:

```bash
curl -X POST http://localhost:3000/mcp/tasks \
  -H "Authorization: Bearer $TOKEN" \
  -H "Idempotency-Key: task-creation-$(date +%s)" \
  -H "Content-Type: application/json" \
  -d '{"title": "My Task", ...}'
```

### Idempotency Behavior

- **First Request**: Processes normally, returns result
- **Duplicate Request**: Returns cached result with `X-Idempotency-Replay: true` header
- **Key Expiry**: Keys expire after 24 hours by default

## 📡 API Endpoints

### Health & Status

#### `GET /healthz`
Health check endpoint (no auth required).

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "version": "1.0.0",
  "transport": "http"
}
```

#### `GET /`
Root endpoint with API information (no auth required).

**Response:**
```json
{
  "name": "TaskHub MCP Server",
  "version": "1.0.0",
  "transport": "http",
  "endpoints": ["/mcp/tasks", "/mcp/reviews"],
  "documentation": "/docs"
}
```

### Task Management

#### `POST /mcp/tasks` - Create Task (submit_spec)

**Request:**
```json
{
  "title": "Fix authentication bug",
  "description": "Users cannot log in with special characters in passwords",
  "acceptance_criteria": [
    "Users can log in with special characters",
    "All existing tests pass",
    "New tests added for edge cases"
  ],
  "repo": "myorg/myapp",
  "priority": "high",
  "labels": ["bug", "auth"]
}
```

**Response:**
```json
{
  "task_id": 123,
  "title": "Fix authentication bug",
  "status": "todo",
  "created_at": "2024-01-01T12:00:00.000Z"
}
```

#### `GET /mcp/tasks` - List Tasks (list_tasks)

**Query Parameters:**
- `status`: Filter by status (`todo`, `claimed`, `in_progress`, `review`, `done`)
- `assignee`: Filter by assignee username
- `repo`: Filter by repository
- `limit`: Number of tasks to return (default: 10, max: 100)
- `offset`: Pagination offset

**Response:**
```json
{
  "tasks": [
    {
      "task_id": 123,
      "title": "Fix authentication bug",
      "status": "todo",
      "assignee": null,
      "repo": "myorg/myapp",
      "created_at": "2024-01-01T12:00:00.000Z"
    }
  ],
  "total": 1,
  "limit": 10,
  "offset": 0
}
```

#### `POST /mcp/tasks/:id/claim` - Claim Task (claim_task)

**Request:**
```json
{
  "assignee": "developer-username"
}
```

**Response:**
```json
{
  "task_id": 123,
  "status": "claimed",
  "assignee": "developer-username",
  "claimed_at": "2024-01-01T12:00:00.000Z"
}
```

### Development Workflow

#### `POST /mcp/tasks/:id/branch` - Start Branch (start_branch)

**Request:**
```json
{
  "branch_name": "feature/fix-auth-bug-123"
}
```

**Response:**
```json
{
  "task_id": 123,
  "branch_name": "feature/fix-auth-bug-123",
  "status": "in_progress",
  "branch_url": "https://github.com/myorg/myapp/tree/feature/fix-auth-bug-123"
}
```

#### `POST /mcp/tasks/:id/patch` - Push Changes (push_patch)

**Request:**
```json
{
  "files": [
    {
      "path": "src/auth.js",
      "content": "// Fixed authentication logic\n...",
      "encoding": "utf-8"
    }
  ],
  "commit_message": "Fix authentication with special characters"
}
```

**Response:**
```json
{
  "task_id": 123,
  "commit_sha": "abc123def456",
  "files_changed": 1,
  "commit_url": "https://github.com/myorg/myapp/commit/abc123def456"
}
```

#### `POST /mcp/tasks/:id/pr` - Open Pull Request (open_pr)

**Request:**
```json
{
  "title": "Fix authentication bug",
  "body": "Fixes issue with special characters in passwords",
  "draft": false
}
```

**Response:**
```json
{
  "task_id": 123,
  "pr_number": 456,
  "pr_url": "https://github.com/myorg/myapp/pull/456",
  "status": "review"
}
```

### Code Review

#### `POST /mcp/tasks/:id/review` - Post Review (post_review)

**Request:**
```json
{
  "event": "APPROVE",
  "body": "LGTM! Great fix for the authentication issue.",
  "blocking": false
}
```

**Response:**
```json
{
  "task_id": 123,
  "review_id": 789,
  "event": "APPROVE",
  "pr_number": 456
}
```

#### `POST /mcp/reviews` - Direct Review (post_review)

Alternative endpoint that accepts PR number directly:

**Request:**
```json
{
  "pr_number": 456,
  "repo": "myorg/myapp",
  "event": "REQUEST_CHANGES",
  "body": "Please add more test coverage",
  "blocking": true
}
```

## ⚡ Rate Limiting

- **Default Limit**: 100 requests per minute per IP
- **Headers**: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- **Response**: `429 Too Many Requests` when exceeded

## 🛡️ Security Features

- **CORS**: Configurable origins
- **Helmet**: Security headers (CSP, HSTS, etc.)
- **JWT Validation**: Signature verification and expiry checks
- **Permission Checks**: Role-based access control
- **Request Validation**: Input sanitization and validation
- **Audit Logging**: All requests logged with user context

## 🐛 Error Handling

### Error Response Format

```json
{
  "error": "ValidationError",
  "message": "Invalid task title: must be between 1 and 200 characters",
  "statusCode": 400,
  "timestamp": "2024-01-01T12:00:00.000Z",
  "path": "/mcp/tasks",
  "requestId": "req-123"
}
```

### Common Status Codes

- `200`: Success
- `400`: Bad Request (validation error)
- `401`: Unauthorized (missing/invalid token)
- `403`: Forbidden (insufficient permissions)
- `404`: Not Found
- `409`: Conflict (idempotency key mismatch)
- `429`: Too Many Requests (rate limited)
- `500`: Internal Server Error

## 🔧 Configuration

### Environment Variables

```bash
# Transport configuration
TRANSPORTS=stdio,http          # Enable both transports
BASE_PATH=/mcp                 # API base path
PORT=3000                      # HTTP server port

# JWT configuration
JWT_SECRET=your-secret-key     # JWT signing secret
JWT_TTL_MIN=30                 # Token TTL in minutes

# Idempotency
IDEMPOTENCY_REQUIRED=false     # Require idempotency keys
REQUEST_ID_HEADER=x-request-id # Request ID header name

# Security
CORS_ORIGINS=*                 # CORS allowed origins
RATE_LIMIT_MAX=100            # Rate limit per minute
```

## 📝 Examples

See `scripts/test-http-transport.js` for comprehensive examples of all endpoints.

## 🔗 Integration

### ChatGPT Integration

The HTTP API is designed for ChatGPT integration. Configure your ChatGPT action with:

- **Base URL**: `https://your-server.com/mcp`
- **Authentication**: Bearer token
- **Headers**: `Content-Type: application/json`

### Webhook Integration

Use the HTTP endpoints to integrate with CI/CD pipelines, GitHub Actions, or other automation tools.
