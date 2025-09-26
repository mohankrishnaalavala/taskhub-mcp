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
---
## Additive Phases (No Flow Change)

> These are **features** layered onto your current phases. Keep your Phase 1–5 as-is; add these as 2.5 / 3.5 / 4.5 / 5.5. They don’t change public tool names or the agent flow.

### 🔌 Phase 2.5 — Remote HTTP + Guardrails
**Goal:** Keep `stdio` flow; **add** HTTP transport for ChatGPT Dev Mode. Add auth, idempotency, audit as middlewares.

**Tasks**
1) **HTTP surface**: Fastify server with `POST /mcp/tools/:name` (streaming OK later) and `GET /healthz`, `GET /readyz`.

2) **Auth**: Bearer JWT middleware (`Authorization: Bearer <token>`); short‑lived tokens. CLI to mint tokens.

3) **Idempotency (mutations only)**: Honor `Idempotency-Key` header; table `idempotency_keys(key, tool, request_hash, response, created_at)`. On duplicate, return stored response.

4) **Audit**: Persist tool, actor, inputs (redacted), outputs, status, latency, `request_id`.

5) **Limits**: `MAX_PATCH_BYTES`, filename allowlist; friendly error messages.


**Env additions (append to `.env.example`)**
```
TRANSPORTS=stdio,http
BASE_PATH=/mcp
JWT_SECRET=change-me
JWT_TTL_MIN=30
IDEMPOTENCY_REQUIRED=true
ALLOWED_REPOS=org/app1,org/app2
DRY_RUN=true
MAX_PATCH_BYTES=200000
FILE_ALLOWED_PATTERNS=^src/|^apps/|^packages/
LOG_LEVEL=info
```

**Tests**
- Unit: auth pass/fail; duplicate `Idempotency-Key` returns same payload.
- Integration: `POST /mcp/tools/submit_spec` happy path + duplicate key.
- E2E: ChatGPT Dev Mode calls `list_tasks` and `submit_spec` over HTTP.

---

### 🐙 Phase 3.5 — GitHub App Auth (feature-flag; keep PAT path)
**Goal:** Keep PAT for dev; **add** GitHub App mode (safer, revocable).

**Tasks**
- Adapter supports `GITHUB_AUTH=pat|app`.
- If `app`: require `GITHUB_APP_ID`, `GITHUB_APP_INSTALLATION_ID`, `GITHUB_APP_PRIVATE_KEY_BASE64`.
- Minimal scopes: `contents`, `pull_requests`.

**Env**
```
GITHUB_AUTH=pat   # switch to 'app' when ready
GITHUB_APP_ID=
GITHUB_APP_INSTALLATION_ID=
GITHUB_APP_PRIVATE_KEY_BASE64=
```

**Tests**
- Token exchange mocked; 401 when repo not installed; enforce `ALLOWED_REPOS`.

---

### 🧩 Phase 4.5 — PR Hygiene (templates & branch rules)
**Goal:** Improve review quality without changing tools.

**Tasks**
- Server derives branch: `feature/<slug>-<task_id>` in `start_branch`.
- `open_pr` injects a checklist from acceptance criteria.
- Enforce state machine: `todo → claimed → in_progress → review → done`.

---

### 🧪 Phase 5.5 — Demo Script & curl Examples
**Goal:** One command to prove E2E.

**Script** (`npm run demo:happy`):
1) `submit_spec` → 2) `list_tasks` → 3) `claim_task` → 4) `start_branch` → 5) `push_patch` (two small commits) → 6) `open_pr` (draft) → 7) `post_review` (block=true then false)

**curl example**
```bash
curl -sS -X POST "https://YOUR-URL/mcp/tools/submit_spec" \  -H "Authorization: Bearer $TASKHUB_JWT" \  -H "Idempotency-Key: taskhub-42-$(date +%s)" \  -H "Content-Type: application/json" \  -d '{
    "title": "RequestGrid",
    "description": "Create React grid with pagination and status filter",
    "acceptance_criteria": ["pagination(20)", "filter by status", "ARIA labels", "unit tests"],
    "repo": "org/app"
  }'
```

---

## Agent Prompts (Drop‑in / Additive)

> Paste these blocks into your agent runner config. They assume the 7 tools are available and the additive phases above are present (HTTP, auth, idempotency, audit).

### 🌐 Global Rules (All Agents)
- Always prefer **calling tools** over free text if a tool exists.
- On failure, **print server message** and propose a fix (e.g., “repo not allowed; update `ALLOWED_REPOS` or change task.repo”).
- For any **mutating** tool (`submit_spec`, `claim_task`, `start_branch`, `push_patch`, `open_pr`, `post_review`), include an **`Idempotency-Key`** header of the form: `taskhub-<task_id>-<timestamp>`.
- Never push binaries. Respect filename allowlist and size caps.
- Use the **server‑returned branch**; do not invent names.

### 🛠️ Augment Code — Implementation Loop (Prompt)
> **Goal:** Implement tasks produced by ChatGPT via TaskHub MCP.

> **Steps (always follow in order):**

> 1) Call `list_tasks(status='todo')`. If empty, ask ChatGPT to run `submit_spec` and wait.

> 2) Call `claim_task(task_id, assignee='augment')`. If 409 (already claimed), request reassignment in chat.

> 3) Call `start_branch(task_id, repo)` and **use the returned branch** for all commits.

> 4) For each atomic change, call `push_patch(task_id, files=[{path, content_b64}], headers:{Idempotency-Key})`. Split large patches; obey caps and allowlist.

> 5) Call `open_pr(task_id, repo, draft=true)`. PR body must include a checklist derived from acceptance criteria and a brief summary of changes.

> 6) Call `post_review(task_id, notes='Summary of changes & what’s left', block=false)` and wait for reviewer feedback before continuing.

> **Constraints:** Never commit secrets or binaries; only text/code. Follow the repo’s lint/test conventions if present. If PR checks fail, push a new patch that fixes them.


### 🧠 ChatGPT — Reviewer Loop (Prompt)
> **Role:** Product reviewer using TaskHub MCP.

> **Process:**

> - Inspect the PR body and files. Verify acceptance criteria.

> - If any criterion is missing or regression risk exists, call `post_review(task_id|pr, notes='<numbered actionable list>', block=true)`.

> - Once all criteria and tests pass, call `post_review(task_id|pr, notes='Approved. Merge when CI is green.', block=false)` with a short risk note and follow‑ups.

> **Do not** merge; leave merging to maintainers or automated policy.


### 🔎 Discovery & Sanity (Prompt Snippet)
> On startup, verify connectivity by calling `list_tasks`. If the server responds with 401/403, surface “Auth invalid — mint a fresh JWT.” If 404 on `/mcp`, suggest using the root or fixing `BASE_PATH`.


### 🧯 Error Handling (Prompt Snippet)
> Always include the server error message in your response. Suggest concrete remediation (e.g., “Flip DRY_RUN=false to create real PRs” or “Install the GitHub App on repo org/app”).


### 🧾 Idempotency (Prompt Snippet)
> For all writes, set `Idempotency-Key: taskhub-<task_id>-<timestamp>` and retry safely on network errors. If the server returns a prior result, proceed without duplicating work.


---

## Optional: Build‑the‑Server Prompt (for Augment to scaffold MCP)
> **Goal:** Build a production‑ready **TaskHub MCP** server (TypeScript + Fastify) per the README and this file.

> **Implement:** 7 tools with Zod schemas; HTTP transport (`POST /mcp/tools/:name`, `GET /healthz`,`/readyz`); Prisma ORM (SQLite dev, Postgres prod); GitHub integration via App (feature‑flag) or PAT (dev); JWT auth; repo allowlist; dry‑run default; idempotency (`Idempotency-Key`); audit log; Pino logs with `request_id`; scripts: `dev`, `test`, `demo:happy`; Dockerfile (distroless, non‑root); Helm chart (secrets, resources, HPA). 

> **Constraints:** No shell/exec tools; enforce filename allowlist and size caps. All PRs open **draft** unless `force=true` and policy allows.
## Additive Phases (No Flow Change)

> These are **features** layered onto your current phases. Keep your Phase 1–5 as-is; add these as 2.5 / 3.5 / 4.5 / 5.5. They don’t change public tool names or the agent flow.

### 🔌 Phase 2.5 — Remote HTTP + Guardrails
**Goal:** Keep `stdio` flow; **add** HTTP transport for ChatGPT Dev Mode. Add auth, idempotency, audit as middlewares.

**Tasks**
1) **HTTP surface**: Fastify server with `POST /mcp/tools/:name` (streaming OK later) and `GET /healthz`, `GET /readyz`.

2) **Auth**: Bearer JWT middleware (`Authorization: Bearer <token>`); short‑lived tokens. CLI to mint tokens.

3) **Idempotency (mutations only)**: Honor `Idempotency-Key` header; table `idempotency_keys(key, tool, request_hash, response, created_at)`. On duplicate, return stored response.

4) **Audit**: Persist tool, actor, inputs (redacted), outputs, status, latency, `request_id`.

5) **Limits**: `MAX_PATCH_BYTES`, filename allowlist; friendly error messages.


**Env additions (append to `.env.example`)**
```
TRANSPORTS=stdio,http
BASE_PATH=/mcp
JWT_SECRET=change-me
JWT_TTL_MIN=30
IDEMPOTENCY_REQUIRED=true
ALLOWED_REPOS=org/app1,org/app2
DRY_RUN=true
MAX_PATCH_BYTES=200000
FILE_ALLOWED_PATTERNS=^src/|^apps/|^packages/
LOG_LEVEL=info
```

**Tests**
- Unit: auth pass/fail; duplicate `Idempotency-Key` returns same payload.
- Integration: `POST /mcp/tools/submit_spec` happy path + duplicate key.
- E2E: ChatGPT Dev Mode calls `list_tasks` and `submit_spec` over HTTP.

---

### 🐙 Phase 3.5 — GitHub App Auth (feature-flag; keep PAT path)
**Goal:** Keep PAT for dev; **add** GitHub App mode (safer, revocable).

**Tasks**
- Adapter supports `GITHUB_AUTH=pat|app`.
- If `app`: require `GITHUB_APP_ID`, `GITHUB_APP_INSTALLATION_ID`, `GITHUB_APP_PRIVATE_KEY_BASE64`.
- Minimal scopes: `contents`, `pull_requests`.

**Env**
```
GITHUB_AUTH=pat   # switch to 'app' when ready
GITHUB_APP_ID=
GITHUB_APP_INSTALLATION_ID=
GITHUB_APP_PRIVATE_KEY_BASE64=
```

**Tests**
- Token exchange mocked; 401 when repo not installed; enforce `ALLOWED_REPOS`.

---

### 🧩 Phase 4.5 — PR Hygiene (templates & branch rules)
**Goal:** Improve review quality without changing tools.

**Tasks**
- Server derives branch: `feature/<slug>-<task_id>` in `start_branch`.
- `open_pr` injects a checklist from acceptance criteria.
- Enforce state machine: `todo → claimed → in_progress → review → done`.

---

### 🧪 Phase 5.5 — Demo Script & curl Examples
**Goal:** One command to prove E2E.

**Script** (`npm run demo:happy`):
1) `submit_spec` → 2) `list_tasks` → 3) `claim_task` → 4) `start_branch` → 5) `push_patch` (two small commits) → 6) `open_pr` (draft) → 7) `post_review` (block=true then false)

**curl example**
```bash
curl -sS -X POST "https://YOUR-URL/mcp/tools/submit_spec" \  -H "Authorization: Bearer $TASKHUB_JWT" \  -H "Idempotency-Key: taskhub-42-$(date +%s)" \  -H "Content-Type: application/json" \  -d '{
    "title": "RequestGrid",
    "description": "Create React grid with pagination and status filter",
    "acceptance_criteria": ["pagination(20)", "filter by status", "ARIA labels", "unit tests"],
    "repo": "org/app"
  }'
```

---

## Agent Prompts (Drop‑in / Additive)

> Paste these blocks into your agent runner config. They assume the 7 tools are available and the additive phases above are present (HTTP, auth, idempotency, audit).

### 🌐 Global Rules (All Agents)
- Always prefer **calling tools** over free text if a tool exists.
- On failure, **print server message** and propose a fix (e.g., “repo not allowed; update `ALLOWED_REPOS` or change task.repo”).
- For any **mutating** tool (`submit_spec`, `claim_task`, `start_branch`, `push_patch`, `open_pr`, `post_review`), include an **`Idempotency-Key`** header of the form: `taskhub-<task_id>-<timestamp>`.
- Never push binaries. Respect filename allowlist and size caps.
- Use the **server‑returned branch**; do not invent names.

### 🛠️ Augment Code — Implementation Loop (Prompt)
> **Goal:** Implement tasks produced by ChatGPT via TaskHub MCP.

> **Steps (always follow in order):**

> 1) Call `list_tasks(status='todo')`. If empty, ask ChatGPT to run `submit_spec` and wait.

> 2) Call `claim_task(task_id, assignee='augment')`. If 409 (already claimed), request reassignment in chat.

> 3) Call `start_branch(task_id, repo)` and **use the returned branch** for all commits.

> 4) For each atomic change, call `push_patch(task_id, files=[{path, content_b64}], headers:{Idempotency-Key})`. Split large patches; obey caps and allowlist.

> 5) Call `open_pr(task_id, repo, draft=true)`. PR body must include a checklist derived from acceptance criteria and a brief summary of changes.

> 6) Call `post_review(task_id, notes='Summary of changes & what’s left', block=false)` and wait for reviewer feedback before continuing.

> **Constraints:** Never commit secrets or binaries; only text/code. Follow the repo’s lint/test conventions if present. If PR checks fail, push a new patch that fixes them.


### 🧠 ChatGPT — Reviewer Loop (Prompt)
> **Role:** Product reviewer using TaskHub MCP.

> **Process:**

> - Inspect the PR body and files. Verify acceptance criteria.

> - If any criterion is missing or regression risk exists, call `post_review(task_id|pr, notes='<numbered actionable list>', block=true)`.

> - Once all criteria and tests pass, call `post_review(task_id|pr, notes='Approved. Merge when CI is green.', block=false)` with a short risk note and follow‑ups.

> **Do not** merge; leave merging to maintainers or automated policy.


### 🔎 Discovery & Sanity (Prompt Snippet)
> On startup, verify connectivity by calling `list_tasks`. If the server responds with 401/403, surface “Auth invalid — mint a fresh JWT.” If 404 on `/mcp`, suggest using the root or fixing `BASE_PATH`.


### 🧯 Error Handling (Prompt Snippet)
> Always include the server error message in your response. Suggest concrete remediation (e.g., “Flip DRY_RUN=false to create real PRs” or “Install the GitHub App on repo org/app”).


### 🧾 Idempotency (Prompt Snippet)
> For all writes, set `Idempotency-Key: taskhub-<task_id>-<timestamp>` and retry safely on network errors. If the server returns a prior result, proceed without duplicating work.


---

