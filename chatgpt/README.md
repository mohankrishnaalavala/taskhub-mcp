# ChatGPT Integration for TaskHub MCP

This directory contains the configuration files needed to integrate TaskHub MCP Server with ChatGPT Actions.

## Files

- **`taskhub-actions-schema.yaml`** - Complete OpenAPI 3.0 schema for ChatGPT Actions
- **`taskhub-actions-config.json`** - ChatGPT Actions configuration metadata
- **`CHATGPT_INTEGRATION.md`** - Detailed integration guide and examples

## Quick Setup

### 1. Start TaskHub MCP Server

```bash
# Development mode (includes demo token endpoint)
NODE_ENV=development TRANSPORTS=http PORT=3000 JWT_SECRET=your-secret-key node dist/server.js
```

### 2. Configure ChatGPT Actions

1. Go to ChatGPT → Settings → Beta Features → Actions
2. Create a new action
3. Import the OpenAPI schema from `taskhub-actions-schema.yaml`
4. Set the server URL to your TaskHub MCP server
5. Configure authentication as "Bearer" type

### 3. Get Authentication Token

```bash
curl -X POST http://localhost:3000/auth/demo-token
```

Use the returned JWT token in the Authorization header for all requests.

## Example ChatGPT Prompts

### Create and Develop a Feature
```
I need to implement a user dashboard feature. Please:
1. Create a task for "User Dashboard with Analytics" in the myorg/frontend-app repository
2. Include acceptance criteria for responsive design, charts, and user data display
3. Claim the task for developer "john-doe"
4. Create a feature branch
5. Generate React component code for the dashboard
6. Push the code changes
7. Open a pull request
8. Post an approval review

The dashboard should show user statistics, activity charts, and be mobile-responsive.
```

### Review Existing Tasks
```
Show me all tasks that are currently in review status. For each task, provide:
- Task title and description
- Assigned developer
- Repository
- Acceptance criteria status

Then help me review and approve any tasks that look ready.
```

### Batch Task Creation
```
Create multiple tasks for a new e-commerce feature:
1. "Product Catalog API" - Backend API for product management
2. "Product Search UI" - Frontend search and filtering
3. "Shopping Cart Component" - Add to cart functionality
4. "Checkout Flow" - Payment processing workflow

All tasks should be for the myorg/ecommerce-app repository with appropriate acceptance criteria.
```

## API Endpoints Summary

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/healthz` | GET | Health check |
| `/auth/demo-token` | POST | Get demo JWT token |
| `/mcp/tasks` | GET | List tasks |
| `/mcp/tasks` | POST | Create task |
| `/mcp/tasks/{id}/claim` | POST | Claim task |
| `/mcp/tasks/{id}/branch` | POST | Create branch |
| `/mcp/tasks/{id}/patch` | POST | Push code |
| `/mcp/tasks/{id}/pr` | POST | Open PR |
| `/mcp/tasks/{id}/review` | POST | Post review |

## Authentication Flow

1. **Get Token**: Call `/auth/demo-token` to get JWT
2. **Use Token**: Include `Authorization: Bearer <token>` in all requests
3. **Refresh**: Tokens expire in 30 minutes, get new token as needed

## Error Handling

Common error responses:
- `401` - Authentication failed (get new token)
- `404` - Task not found (check task ID)
- `400` - Validation error (check request format)
- `500` - Server error (check server logs)

## Production Deployment

For production use:
1. Deploy TaskHub MCP server to a public URL
2. Update the server URL in ChatGPT Actions configuration
3. Use proper JWT secret management
4. Configure GitHub App authentication
5. Set up HTTPS with valid SSL certificates

## Security Notes

- Demo tokens are for development only
- Use HTTPS in production
- Rotate JWT secrets regularly
- Implement proper user authentication
- Monitor API usage and rate limits

## Troubleshooting

### Common Issues

1. **"Authentication failed"**
   - Get a new demo token
   - Check token format in Authorization header

2. **"Route not found"**
   - Verify server is running in development mode
   - Check endpoint URLs match the schema

3. **"Validation failed"**
   - Check required fields in request body
   - Verify data types and formats

4. **"GitHub error"**
   - Check repository permissions
   - Verify GitHub token configuration

### Debug Mode

Enable detailed logging:
```bash
DEBUG=taskhub:* NODE_ENV=development TRANSPORTS=http node dist/server.js
```

## Next Steps

1. Test the integration with simple prompts
2. Customize the schema for your specific needs
3. Add custom endpoints for your workflow
4. Implement production authentication
5. Deploy to production environment

For detailed examples and advanced configuration, see `CHATGPT_INTEGRATION.md`.
