# TaskHub MCP (ChatGPT ↔ VS Code/Augment) — Full Plan

> **Repo name:** `taskhub-mcp`

---

## 0) Elevator Pitch

Build a **Model Context Protocol (MCP) server** that acts as a **shared hub** between:

* **ChatGPT (Developer Mode)** — the *product brain* that researches requirements and performs reviews.
* **VS Code + Augment Code** — the *developer agents* that implement tasks, push patches, and open PRs.

**Goal:** Ship production-grade app features faster by turning chat research → structured specs → claimed tasks → code → review → merge, all through typed MCP tools with audit trails and guardrails.

**Target:** Complete product building in a day after business requirements are defined.

**Non‑Goals (v1):** long-running orchestration/approvals inside ChatGPT; direct shell/cluster control; multi-cloud rollouts.

---

## 1) MVP Scope (Simplified)

Seven core tools (typed, safe):

1. `submit_spec(title, description, acceptance_criteria[], repo?) → { task_id }`
2. `list_tasks(status?, assignee?) → { tasks[] }`
3. `claim_task(task_id) → { task }`
4. `start_branch(task_id, repo, base?) → { branch }`
5. `push_patch(task_id, files[]) → { commit_sha }`
6. `open_pr(task_id, repo, draft=true) → { pr_number, url }`
7. `post_review(task_id | pr, notes, block=false) → { status }`

**Safety defaults:** dry‑run ON, repo allowlist, PRs open as **draft**, file size caps, approval gates for privileged actions.

**MVP Simplifications:**
- Single-tenant (no multi-tenancy)
- stdio MCP transport (not HTTP initially)
- Personal Access Token auth (not GitHub App)
- File-based patches only (no unified diffs)
- Synchronous operations (no queuing)
- SQLite only (Postgres later)

---

## 2) Architecture (Simplified)

```mermaid
flowchart LR
  subgraph Clients
    A[ChatGPT Dev Mode] -->|MCP stdio| H
    B[VS Code + Augment] -->|MCP stdio| H
  end
  H[TaskHub MCP Server]
  H -->|PAT| G[(GitHub)]
  H -->|Prisma| D[(SQLite)]
  H -->|Local FS| S[(Temp Files)]
```

**Stack (MVP):** Node.js **TypeScript** + MCP TS SDK (stdio), Zod validation, Prisma ORM, SQLite, Pino logs, GitHub PAT auth.

---

## 3) Requirements

* **Functional**: Create/track tasks; convert chat specs into tasks; claim & branch; accept file patches; open PRs; collect reviews; enforce guardrails.
* **Security**: Bearer token auth, repo allowlist, audit logging, PII‑free by default, least‑privilege PAT.
* **Reliability**: Idempotent tool calls, exponential backoff retries, request timeouts, file size limits.
* **Observability**: Request IDs, structured logs, basic metrics, health checks.
* **DX**: One‑command dev (`npm run dev`), seed script, example configs, end‑to‑end demo.

---

## 4) Data Model (Prisma - Single Tenant)

```ts
model Task {
  id                Int         @id @default(autoincrement())
  title             String
  description       String
  status            String      @default("todo") // todo, claimed, in_progress, review, done
  assignee          String?
  repo              String?
  branch            String?
  acceptanceCriteria Json
  createdAt         DateTime    @default(now())
  updatedAt         DateTime    @updatedAt
  artifacts         Artifact[]
  events            Event[]
}

model Artifact {
  id        String   @id @default(cuid())
  taskId    Int
  type      String   // commit, patch, review
  url       String?
  sha256    String?
  metadata  Json?
  createdAt DateTime @default(now())
  task      Task     @relation(fields: [taskId], references: [id])
}

model Event {
  id        String   @id @default(cuid())
  taskId    Int?
  actor     String
  action    String   // submit_spec, claim_task, push_patch, etc.
  targetId  String?
  payload   Json
  success   Boolean  @default(true)
  error     String?
  createdAt DateTime @default(now())
  task      Task?    @relation(fields: [taskId], references: [id])
}
```

---

## 5) MCP Surface (Tools & Schemas)

**`submit_spec`**
```json
{
  "name": "submit_spec",
  "description": "Create a new task with structured requirements",
  "input_schema": {
    "type": "object",
    "required": ["title", "description", "acceptance_criteria"],
    "properties": {
      "title": {"type": "string", "minLength": 3, "maxLength": 140},
      "description": {"type": "string", "minLength": 10, "maxLength": 5000},
      "acceptance_criteria": {"type": "array", "items": {"type": "string"}, "minItems": 1, "maxItems": 20},
      "repo": {"type": "string", "pattern": "^[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+$"}
    }
  }
}
```

**`list_tasks`**
```json
{
  "name": "list_tasks",
  "description": "List tasks with optional filtering",
  "input_schema": {
    "type": "object",
    "properties": {
      "status": {"type": "string", "enum": ["todo", "claimed", "in_progress", "review", "done"]},
      "assignee": {"type": "string"},
      "repo": {"type": "string"}
    }
  }
}
```

**`claim_task`**
```json
{
  "name": "claim_task",
  "description": "Claim a task for implementation",
  "input_schema": {
    "type": "object",
    "required": ["task_id", "assignee"],
    "properties": {
      "task_id": {"type": "integer", "minimum": 1},
      "assignee": {"type": "string", "minLength": 1}
    }
  }
}
```

**`start_branch`**
```json
{
  "name": "start_branch",
  "description": "Create a feature branch for the task",
  "input_schema": {
    "type": "object",
    "required": ["task_id", "repo"],
    "properties": {
      "task_id": {"type": "integer", "minimum": 1},
      "repo": {"type": "string"},
      "base": {"type": "string", "default": "main"}
    }
  }
}
```

**`push_patch`**
```json
{
  "name": "push_patch",
  "description": "Push file changes to the task branch",
  "input_schema": {
    "type": "object",
    "required": ["task_id", "files", "commit_message"],
    "properties": {
      "task_id": {"type": "integer", "minimum": 1},
      "commit_message": {"type": "string", "minLength": 10, "maxLength": 200},
      "files": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["path", "content"],
          "properties": {
            "path": {"type": "string", "pattern": "^[^/].*[^/]$"},
            "content": {"type": "string"},
            "encoding": {"type": "string", "enum": ["utf8", "base64"], "default": "utf8"}
          }
        },
        "minItems": 1,
        "maxItems": 50
      }
    }
  }
}
```

**`open_pr`**
```json
{
  "name": "open_pr",
  "description": "Open a pull request for the task",
  "input_schema": {
    "type": "object",
    "required": ["task_id", "repo"],
    "properties": {
      "task_id": {"type": "integer", "minimum": 1},
      "repo": {"type": "string"},
      "title": {"type": "string"},
      "body": {"type": "string"},
      "draft": {"type": "boolean", "default": true}
    }
  }
}
```

**`post_review`**
```json
{
  "name": "post_review",
  "description": "Post a review comment on task or PR",
  "input_schema": {
    "type": "object",
    "required": ["notes"],
    "properties": {
      "task_id": {"type": "integer"},
      "pr_number": {"type": "integer"},
      "notes": {"type": "string", "minLength": 10},
      "block": {"type": "boolean", "default": false},
      "approve": {"type": "boolean", "default": false}
    }
  }
}
```

---

## 6) Error Handling Strategy

**Retry Logic:**
- GitHub API: 3 retries with exponential backoff (1s, 2s, 4s)
- Database: 2 retries with 500ms delay
- File operations: 1 retry with 100ms delay

**Error Categories:**
```ts
enum ErrorType {
  VALIDATION = 'validation',
  AUTH = 'auth', 
  RATE_LIMIT = 'rate_limit',
  NOT_FOUND = 'not_found',
  CONFLICT = 'conflict',
  GITHUB_API = 'github_api',
  DATABASE = 'database',
  INTERNAL = 'internal'
}
```

**Error Response Format:**
```json
{
  "error": {
    "type": "validation",
    "message": "Invalid task_id",
    "code": "TASK_NOT_FOUND",
    "details": {"task_id": 123},
    "retry_after": null
  }
}
```

**Graceful Degradation:**
- GitHub API down → log error, return cached data where possible
- Database locked → retry with backoff
- Large files → reject with size limit error
- Invalid repo → fail fast with clear message

---

## 7) Security & Guardrails

**Authentication:**
- Single bearer token in `.env` for MVP
- Token validation on every MCP call
- No token in logs (redacted)

**Authorization:**
- Repo allowlist: `ALLOWED_REPOS=owner/repo1,owner/repo2`
- File path validation: no `../`, no hidden files, no binaries
- File size limits: 1MB per file, 10MB total per patch

**Audit Trail:**
- Every tool call logged with inputs/outputs (sanitized)
- GitHub operations logged with commit SHAs
- Failed operations logged with error details

**Safety Defaults:**
- `DRY_RUN=true` by default
- All PRs created as drafts
- Branch names prefixed with `taskhub/`
- Commit messages include task ID

---

## 8) Local Dev Setup

```bash
git clone <repo>
cd taskhub-mcp
npm install
cp .env.example .env
# Edit .env with your GitHub PAT and allowed repos
npm run db:setup
npm run dev
```

**.env.example**
```bash
NODE_ENV=development
PORT=3000
DATABASE_URL=file:./dev.db
GITHUB_TOKEN=ghp_your_personal_access_token
ALLOWED_REPOS=your-username/test-repo
BEARER_TOKEN=dev-secret-change-in-production
DRY_RUN=true
LOG_LEVEL=debug
MAX_FILE_SIZE_MB=1
MAX_PATCH_SIZE_MB=10
RETRY_ATTEMPTS=3
RETRY_DELAY_MS=1000
```

---

## 9) Testing Strategy

**Unit Tests:**
- Zod schema validation
- Tool handlers with mocked GitHub API
- Database operations with test DB
- Error handling scenarios

**Integration Tests:**
- End-to-end flow: submit → claim → branch → patch → PR
- GitHub API integration with test repo
- Database transactions and rollbacks

**E2E Demo:**
```bash
npm run demo:happy-path
# Creates task → claims → branches → commits → opens PR
```

---

## 10) Deployment (Production Ready)

**Docker:**
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
USER node
EXPOSE 3000
CMD ["npm", "start"]
```

**Environment Variables (Production):**
```bash
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@host:5432/taskhub
GITHUB_TOKEN=ghp_production_token
ALLOWED_REPOS=org/app1,org/app2
BEARER_TOKEN=secure-random-token-256-bits
DRY_RUN=false
LOG_LEVEL=info
```

---

## 11) Client Setup

**ChatGPT (Developer Mode):**
1. Install MCP client or use built-in support
2. Configure stdio transport to TaskHub server
3. Use for: requirement analysis, spec creation, code review

**VS Code + Augment:**
1. Install MCP extension
2. Configure TaskHub server connection
3. Use for: task claiming, code implementation, patch pushing

**Workflow Loop:**
1. **ChatGPT**: Analyze requirements → `submit_spec`
2. **Augment**: `list_tasks` → `claim_task` → `start_branch`
3. **Augment**: Write code → `push_patch` → `open_pr`
4. **ChatGPT**: `post_review` with feedback
5. **Augment**: Address feedback → `push_patch`
6. **ChatGPT**: Final approval → merge PR

---

## 12) Acceptance Criteria

- [ ] All 7 MCP tools callable with correct schemas
- [ ] Tasks created and tracked in SQLite database
- [ ] GitHub branches created with `taskhub/task-{id}` naming
- [ ] File patches committed to feature branches
- [ ] Draft PRs opened with task details in description
- [ ] Review comments posted and tracked
- [ ] Comprehensive error handling with retries
- [ ] Audit log for all operations
- [ ] Dry-run mode working correctly
- [ ] E2E demo script passes
- [ ] Unit and integration tests passing
- [ ] Docker container builds and runs
- [ ] Production deployment guide complete

---

## 13) Future Enhancements

**Phase 2:**
- HTTP MCP transport for web clients
- Multi-tenant support with proper isolation
- GitHub App authentication
- Unified diff support for patches
- Queue system for long-running operations

**Phase 3:**
- Figma integration for design handoff
- Slack/Discord notifications
- Advanced approval workflows
- Metrics dashboard
- Auto-merge on approval

---

This simplified approach focuses on getting a working MVP that enables the ChatGPT → Augment → GitHub workflow for rapid product development.

---

