# Agent Prompts for TaskHub MCP Development

> **PRIVATE FILE** - Contains prompts to trigger agent development phases

---

## 🚀 Phase 1: Project Foundation

### Prompt 1A: Initial Setup
```
I need you to set up the initial TaskHub MCP project structure. Please:

1. Create package.json with all required dependencies (MCP SDK, Prisma, Zod, Pino, etc.)
2. Set up TypeScript configuration with strict mode
3. Create .env.example with all environment variables
4. Set up Prisma schema based on the data model in readme.md
5. Create basic project structure (src/, tests/, etc.)
6. Add npm scripts for dev, build, test, lint, type-check

Follow the AGENT_INSTRUCTIONS.md file for all coding standards and commit practices.
```

### Prompt 1B: Core Infrastructure
```
Now implement the core infrastructure:

1. Create src/lib/logger.ts with Pino structured logging
2. Create src/lib/database.ts with Prisma client setup
3. Create src/types/index.ts with all TypeScript definitions
4. Create src/lib/validation.ts with all Zod schemas
5. Create src/lib/errors.ts with error types and Result<T,E> pattern
6. Add basic health check and environment validation

Ensure all modules follow the error handling patterns from AGENT_INSTRUCTIONS.md.
```

---

## 🔧 Phase 2: MCP Server Core

### Prompt 2A: MCP Server Setup
```
Implement the MCP server foundation:

1. Create src/server.ts as the main MCP server entry point
2. Set up stdio transport with proper error handling
3. Implement authentication middleware with bearer token validation
4. Add request logging and audit trail functionality
5. Create basic tool registration system
6. Add graceful shutdown handling

Follow the MCP TypeScript SDK documentation and our security patterns.
```

### Prompt 2B: First MCP Tools
```
Implement the first two MCP tools:

1. submit_spec tool:
   - Validate input with Zod schema
   - Create task in database
   - Log audit event
   - Return task_id
   - Handle all error cases

2. list_tasks tool:
   - Support filtering by status, assignee, repo
   - Return paginated results
   - Include proper error handling

Add comprehensive unit tests for both tools following the test patterns in AGENT_INSTRUCTIONS.md.
```

---

## 🐙 Phase 3: GitHub Integration

### Prompt 3A: GitHub Client
```
Create the GitHub API client:

1. Create src/lib/github.ts with Octokit setup
2. Implement retry logic with exponential backoff
3. Add rate limiting handling
4. Create helper functions for common operations (create branch, commit files, create PR)
5. Add dry-run mode support
6. Implement repo allowlist validation

Include comprehensive error handling and logging without exposing tokens.
```

### Prompt 3B: Git Operation Tools
```
Implement the Git operation MCP tools:

1. claim_task tool:
   - Update task status and assignee
   - Validate task exists and is claimable
   - Log audit event

2. start_branch tool:
   - Validate repo is in allowlist
   - Create branch with taskhub/task-{id} naming
   - Update task with branch info
   - Handle branch already exists

3. push_patch tool:
   - Validate file paths and sizes
   - Commit files to task branch
   - Create artifact records
   - Support dry-run mode

Add unit tests with mocked GitHub API calls.
```

---

## 📋 Phase 4: PR Workflow

### Prompt 4A: PR Management Tools
```
Implement the PR workflow tools:

1. open_pr tool:
   - Create draft PR from task branch
   - Generate PR title and body from task
   - Link task to PR in database
   - Handle PR already exists

2. post_review tool:
   - Post review comments on PR or task
   - Support approve/block flags
   - Update task status based on review
   - Log review in audit trail

Ensure all tools support dry-run mode and have comprehensive error handling.
```

### Prompt 4B: Integration Testing
```
Create comprehensive integration tests:

1. E2E workflow test: submit → claim → branch → patch → PR
2. GitHub API integration tests with test repository
3. Database transaction tests
4. Error scenario tests (rate limits, auth failures, etc.)
5. Dry-run mode validation

Create npm run demo:happy-path script that demonstrates the full workflow.
```

---

## 🚀 Phase 5: Production Readiness

### Prompt 5A: Production Features
```
Add production-ready features:

1. Docker setup with multi-stage build
2. Health check endpoints
3. Metrics collection (basic counters)
4. Environment validation on startup
5. Database migration handling
6. Graceful shutdown with cleanup

Update documentation with deployment instructions.
```

### Prompt 5B: Final Polish
```
Complete the MVP with final touches:

1. Add comprehensive error messages and user guidance
2. Implement request timeouts and circuit breakers
3. Add performance logging for slow operations
4. Create troubleshooting guide
5. Validate all acceptance criteria from readme.md
6. Run full test suite and fix any issues

Ensure the system is ready for real-world usage with proper monitoring and error handling.
```

---

## 🎯 Quick Start Prompt (All-in-One)

### Big Bang Prompt
```
I need you to build a complete TaskHub MCP server that enables ChatGPT ↔ Augment ↔ GitHub workflow. 

Please implement this in phases following AGENT_INSTRUCTIONS.md:

PHASE 1: Set up project structure, dependencies, Prisma schema, and core infrastructure (logger, database, validation, errors)

PHASE 2: Create MCP server with stdio transport, implement submit_spec and list_tasks tools with full validation and testing

PHASE 3: Add GitHub client with retry logic, implement claim_task, start_branch, and push_patch tools with dry-run support

PHASE 4: Complete with open_pr and post_review tools, add integration tests and E2E demo script

PHASE 5: Add Docker setup, health checks, and production readiness features

Key requirements:
- All 7 MCP tools working with proper schemas
- SQLite database with Prisma
- GitHub PAT authentication with repo allowlist
- Comprehensive error handling with Result<T,E> pattern
- Dry-run mode for safe testing
- Unit and integration tests
- Audit logging for all operations
- Production-ready Docker deployment

Follow the exact specifications in readme.md and security patterns in AGENT_INSTRUCTIONS.md. Each commit should be atomic and pass all quality gates.
```

---

## 🔄 Incremental Prompts

Use these if you prefer step-by-step development:

1. **Start with:** Prompt 1A (Initial Setup)
2. **Then:** Prompt 1B (Core Infrastructure) 
3. **Continue with:** Prompt 2A → 2B → 3A → 3B → 4A → 4B → 5A → 5B

Each prompt builds on the previous work and follows the implementation priority from AGENT_INSTRUCTIONS.md.

---

**Choose your approach:**
- **Big Bang**: Use the all-in-one prompt for complete implementation
- **Incremental**: Use phase-by-phase prompts for controlled development
- **Custom**: Mix and match based on your specific needs

All prompts ensure adherence to the coding standards, security patterns, and testing requirements defined in AGENT_INSTRUCTIONS.md.