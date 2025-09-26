# ChatGPT Integration Guide

This guide explains how to integrate the TaskHub MCP Server with ChatGPT using the HTTP transport.

## Overview

The TaskHub MCP Server provides a complete HTTP API that can be used by ChatGPT to manage tasks and GitHub workflows. The server supports:

- **Task Management**: Create, list, and claim tasks
- **GitHub Integration**: Create branches, push patches, open PRs, and post reviews
- **Authentication**: JWT-based authentication with role-based permissions
- **Idempotency**: Prevent duplicate operations with idempotency keys

## Server Setup

### 1. Start the HTTP Server

```bash
# Production deployment
TRANSPORTS=http PORT=3000 JWT_SECRET=your-secret-key node dist/server.js

# Development with demo token endpoint
NODE_ENV=development TRANSPORTS=http PORT=3000 JWT_SECRET=your-secret-key node dist/server.js
```

### 2. Get Authentication Token

For development, you can get a demo token:

```bash
curl -X POST http://localhost:3000/auth/demo-token
```

Response:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "type": "Bearer",
  "expiresIn": "30m",
  "user": {
    "userId": "demo-user-1",
    "username": "demo-user",
    "email": "demo@taskhub.local",
    "roles": ["developer", "admin"]
  }
}
```

## ChatGPT Actions Configuration

### Base Configuration

```yaml
openapi: 3.0.0
info:
  title: TaskHub MCP API
  description: Task management and GitHub workflow automation
  version: 1.0.0
servers:
  - url: http://localhost:3000
    description: Local development server
  - url: https://your-domain.com
    description: Production server

components:
  securitySchemes:
    BearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT

security:
  - BearerAuth: []
```

### Available Endpoints

#### 1. Health Check
```yaml
paths:
  /healthz:
    get:
      summary: Health check
      responses:
        '200':
          description: Server is healthy
          content:
            application/json:
              schema:
                type: object
                properties:
                  status:
                    type: string
                    example: healthy
                  timestamp:
                    type: string
                    format: date-time
                  version:
                    type: string
                    example: "1.0.0"
                  uptime:
                    type: number
                    example: 123.456
```

#### 2. List Tasks
```yaml
  /mcp/tasks:
    get:
      summary: List all tasks
      parameters:
        - name: limit
          in: query
          schema:
            type: integer
            default: 50
        - name: offset
          in: query
          schema:
            type: integer
            default: 0
        - name: status
          in: query
          schema:
            type: string
            enum: [todo, claimed, in_progress, review, done]
      responses:
        '200':
          description: List of tasks
          content:
            application/json:
              schema:
                type: object
                properties:
                  tasks:
                    type: array
                    items:
                      $ref: '#/components/schemas/Task'
                  total:
                    type: integer
                  limit:
                    type: integer
                  offset:
                    type: integer
```

#### 3. Create Task
```yaml
    post:
      summary: Create a new task
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - title
                - description
                - repo
                - acceptance_criteria
              properties:
                title:
                  type: string
                  example: "Add user authentication"
                description:
                  type: string
                  example: "Implement JWT-based authentication system"
                repo:
                  type: string
                  example: "myorg/myapp"
                acceptance_criteria:
                  type: array
                  items:
                    type: string
                  example: ["Login form works", "JWT tokens generated", "Protected routes work"]
      responses:
        '200':
          description: Task created successfully
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Task'
```

#### 4. Claim Task
```yaml
  /mcp/tasks/{id}/claim:
    post:
      summary: Claim a task for development
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: integer
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - assignee
              properties:
                assignee:
                  type: string
                  example: "developer-username"
      responses:
        '200':
          description: Task claimed successfully
```

#### 5. GitHub Operations

```yaml
  /mcp/tasks/{id}/branch:
    post:
      summary: Create a GitHub branch for the task
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: integer
      responses:
        '200':
          description: Branch created successfully

  /mcp/tasks/{id}/patch:
    post:
      summary: Push code changes to the task branch
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: integer
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - files
                - message
              properties:
                files:
                  type: array
                  items:
                    type: object
                    properties:
                      path:
                        type: string
                      content:
                        type: string
                message:
                  type: string
                  example: "feat: implement user authentication"

  /mcp/tasks/{id}/pr:
    post:
      summary: Open a pull request for the task
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: integer
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                title:
                  type: string
                body:
                  type: string
                base:
                  type: string
                  default: "main"

  /mcp/tasks/{id}/review:
    post:
      summary: Post a code review on the pull request
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: integer
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - body
                - event
              properties:
                body:
                  type: string
                  example: "LGTM! Great implementation."
                event:
                  type: string
                  enum: [COMMENT, APPROVE, REQUEST_CHANGES]
                  example: "APPROVE"
```

### Data Schemas

```yaml
components:
  schemas:
    Task:
      type: object
      properties:
        id:
          type: integer
          example: 1
        title:
          type: string
          example: "Add user authentication"
        description:
          type: string
          example: "Implement JWT-based authentication system"
        status:
          type: string
          enum: [todo, claimed, in_progress, review, done]
          example: "todo"
        assignee:
          type: string
          nullable: true
          example: "developer-username"
        repo:
          type: string
          example: "myorg/myapp"
        branch:
          type: string
          nullable: true
          example: "feature/user-auth-1"
        acceptance_criteria:
          type: array
          items:
            type: string
          example: ["Login form works", "JWT tokens generated"]
        created_at:
          type: string
          format: date-time
        updated_at:
          type: string
          format: date-time
```

## Usage Examples

### 1. Complete Workflow Example

```bash
# 1. Get authentication token
TOKEN=$(curl -s -X POST http://localhost:3000/auth/demo-token | jq -r '.token')

# 2. Create a new task
TASK_ID=$(curl -s -X POST http://localhost:3000/mcp/tasks \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Add user dashboard",
    "description": "Create a user dashboard with analytics",
    "repo": "myorg/frontend-app",
    "acceptance_criteria": ["Dashboard loads", "Charts display", "Responsive design"]
  }' | jq -r '.task.id')

# 3. Claim the task
curl -X POST http://localhost:3000/mcp/tasks/$TASK_ID/claim \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"assignee": "developer-1"}'

# 4. Create a branch
curl -X POST http://localhost:3000/mcp/tasks/$TASK_ID/branch \
  -H "Authorization: Bearer $TOKEN"

# 5. Push code changes
curl -X POST http://localhost:3000/mcp/tasks/$TASK_ID/patch \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "files": [
      {
        "path": "src/components/Dashboard.tsx",
        "content": "import React from '\''react'\'';\n\nexport const Dashboard = () => {\n  return <div>Dashboard</div>;\n};"
      }
    ],
    "message": "feat: add user dashboard component"
  }'

# 6. Open pull request
curl -X POST http://localhost:3000/mcp/tasks/$TASK_ID/pr \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Add user dashboard",
    "body": "Implements user dashboard with analytics charts"
  }'

# 7. Post review
curl -X POST http://localhost:3000/mcp/tasks/$TASK_ID/review \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "body": "Great implementation! Dashboard looks good.",
    "event": "APPROVE"
  }'
```

### 2. Error Handling

All endpoints return structured error responses:

```json
{
  "error": "Authentication failed",
  "message": "Invalid token",
  "code": "INVALID_TOKEN",
  "requestId": "req-123"
}
```

Common error codes:
- `MISSING_TOKEN`: Authorization header missing
- `INVALID_TOKEN`: JWT token invalid or expired
- `VALIDATION_FAILED`: Request validation failed
- `TASK_NOT_FOUND`: Task ID not found
- `GITHUB_ERROR`: GitHub API error

### 3. Idempotency

For write operations, include an idempotency key:

```bash
curl -X POST http://localhost:3000/mcp/tasks \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: unique-operation-id-123" \
  -d '{"title": "New task", ...}'
```

## ChatGPT Prompt Examples

### Task Creation Prompt
```
Create a new task for implementing user authentication in the myorg/webapp repository. 
The task should include:
- Title: "Implement user authentication"
- Description: "Add JWT-based authentication with login/logout functionality"
- Acceptance criteria: ["Login form works", "JWT tokens generated", "Protected routes work", "Logout clears session"]

Use the TaskHub API to create this task.
```

### Complete Development Workflow Prompt
```
I need to implement a user dashboard feature. Please:
1. Create a task for "User Dashboard Implementation" in the myorg/frontend-app repo
2. Claim the task for developer "john-doe"
3. Create a feature branch
4. Generate and push the dashboard component code
5. Open a pull request
6. Post an approval review

The dashboard should show user analytics with charts and be responsive.
```

## Security Considerations

1. **JWT Tokens**: Store securely and refresh before expiration
2. **HTTPS**: Always use HTTPS in production
3. **Rate Limiting**: Server enforces 100 requests/minute per IP
4. **Permissions**: Ensure users have appropriate GitHub repository access
5. **Secrets**: Never expose JWT secrets or GitHub tokens

## Troubleshooting

### Common Issues

1. **401 Unauthorized**: Check JWT token validity and format
2. **404 Not Found**: Verify endpoint URLs and task IDs
3. **422 Validation Error**: Check request body format and required fields
4. **500 Server Error**: Check server logs for detailed error information

### Debug Mode

Enable debug logging:
```bash
DEBUG=taskhub:* node dist/server.js
```

### Health Check

Always verify server health before operations:
```bash
curl http://localhost:3000/healthz
```

## Next Steps

1. Deploy the server to a production environment
2. Configure proper JWT secret management
3. Set up GitHub App authentication for production
4. Implement user management and role-based access control
5. Add monitoring and alerting for the HTTP API
