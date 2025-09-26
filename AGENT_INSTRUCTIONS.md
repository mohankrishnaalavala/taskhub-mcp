# Agent Instructions for TaskHub MCP Development

> **For Augment Code Agents:** Follow these instructions for consistent, production-ready development.

---

## 🎯 Mission

Build a robust MCP server that enables ChatGPT ↔ Augment ↔ GitHub workflow for rapid product development. Every commit should move us closer to a working MVP that can handle real tasks safely.

---

## 📋 Commit Standards

### Every Commit Must:
- [ ] **Pass linting**: `npm run lint` (ESLint + Prettier)
- [ ] **Pass type checking**: `npm run type-check` (TypeScript)
- [ ] **Include tests**: Unit tests for new functions/modules
- [ ] **Update docs**: README sections if adding env vars/routes
- [ ] **Follow naming**: Clear, descriptive commit messages
- [ ] **Be atomic**: One logical change per commit

### Commit Message Format:
```
type(scope): description

feat(tools): add submit_spec MCP tool with validation
fix(github): handle rate limiting with exponential backoff
docs(readme): update environment variables section
test(handlers): add unit tests for task creation
```

**Types:** `feat`, `fix`, `docs`, `test`, `refactor`, `chore`

---

## 🏗️ Code Standards

### TypeScript Rules:
```typescript
// ✅ Good: Explicit types, error handling
async function createTask(spec: TaskSpec): Promise<Result<Task, TaskError>> {
  try {
    const validated = TaskSpecSchema.parse(spec);
    const task = await db.task.create({ data: validated });
    return { success: true, data: task };
  } catch (error) {
    logger.error('Failed to create task', { error, spec: sanitize(spec) });
    return { success: false, error: new TaskError('CREATION_FAILED', error) };
  }
}

// ❌ Bad: Any types, swallowed errors
async function createTask(spec: any) {
  try {
    return await db.task.create({ data: spec });
  } catch (error) {
    // Silent failure
  }
}
```

### Error Handling Pattern:
```typescript
// Always use Result<T, E> pattern
type Result<T, E> = 
  | { success: true; data: T }
  | { success: false; error: E };

// Log with context, never swallow
logger.error('Operation failed', { 
  operation: 'push_patch',
  taskId,
  error: error.message,
  stack: error.stack 
});
```

### Validation with Zod:
```typescript
import { z } from 'zod';

const TaskSpecSchema = z.object({
  title: z.string().min(3).max(140),
  description: z.string().min(10).max(5000),
  acceptance_criteria: z.array(z.string()).min(1).max(20),
  repo: z.string().regex(/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/).optional()
});

// Always validate inputs
const result = TaskSpecSchema.safeParse(input);
if (!result.success) {
  return { success: false, error: new ValidationError(result.error) };
}
```

---

## 🧪 Testing Requirements

### Unit Tests (Required):
- **Every MCP tool handler**
- **All validation schemas**
- **Error handling paths**
- **Database operations**

### Test Structure:
```typescript
// tests/tools/submit-spec.test.ts
describe('submit_spec tool', () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  it('should create task with valid spec', async () => {
    const spec = {
      title: 'Test Task',
      description: 'Test description with enough length',
      acceptance_criteria: ['Criterion 1', 'Criterion 2']
    };

    const result = await submitSpec(spec);
    
    expect(result.success).toBe(true);
    expect(result.data.title).toBe(spec.title);
  });

  it('should reject invalid title length', async () => {
    const spec = { title: 'x', description: 'valid desc', acceptance_criteria: ['test'] };
    
    const result = await submitSpec(spec);
    
    expect(result.success).toBe(false);
    expect(result.error.type).toBe('validation');
  });
});
```

### Integration Tests:
```typescript
// tests/integration/workflow.test.ts
describe('E2E Workflow', () => {
  it('should complete submit → claim → branch → patch → PR flow', async () => {
    // Test full workflow with mocked GitHub API
  });
});
```

---

## 🔒 Security Checklist

### Every Feature Must:
- [ ] **Validate repo allowlist**: Check `ALLOWED_REPOS` before Git ops
- [ ] **Sanitize file paths**: No `../`, no hidden files, no binaries
- [ ] **Check file sizes**: 1MB per file, 10MB total per patch
- [ ] **Log without PII**: Redact tokens, sanitize user data
- [ ] **Handle auth errors**: Clear messages, no token leakage

### Security Patterns:
```typescript
// ✅ Repo validation
function validateRepo(repo: string): boolean {
  const allowed = process.env.ALLOWED_REPOS?.split(',') || [];
  return allowed.includes(repo);
}

// ✅ File path validation
function validateFilePath(path: string): boolean {
  return !path.includes('../') && 
         !path.startsWith('.') && 
         !path.includes('\0');
}

// ✅ Sanitized logging
logger.info('GitHub operation', {
  repo: sanitizeRepo(repo),
  branch: branch,
  files: files.map(f => ({ path: f.path, size: f.content.length }))
  // Never log file content or tokens
});
```

---

## 🔧 Development Workflow

### Setup Commands:
```bash
npm install                 # Install dependencies
cp .env.example .env       # Copy environment template
npm run db:setup           # Initialize database
npm run dev                # Start development server
```

### Before Each Commit:
```bash
npm run lint               # Fix formatting
npm run type-check         # Verify TypeScript
npm test                   # Run all tests
npm run build              # Verify build works
```

### File Structure:
```
src/
├── server.ts              # MCP server entry point
├── tools/                 # MCP tool implementations
│   ├── submit-spec.ts
│   ├── list-tasks.ts
│   └── ...
├── lib/                   # Shared utilities
│   ├── github.ts          # GitHub API client
│   ├── database.ts        # Prisma client
│   ├── validation.ts      # Zod schemas
│   └── logger.ts          # Pino logger
├── types/                 # TypeScript definitions
└── config/                # Configuration
```

---

## 🚀 Implementation Priority

### Phase 1 (Core MVP):
1. **Database setup** (Prisma + SQLite)
2. **MCP server skeleton** (stdio transport)
3. **submit_spec tool** (with validation)
4. **list_tasks tool** (with filtering)
5. **Basic error handling**

### Phase 2 (Git Integration):
1. **GitHub client** (with retry logic)
2. **claim_task tool**
3. **start_branch tool**
4. **push_patch tool**
5. **Dry-run mode**

### Phase 3 (PR Workflow):
1. **open_pr tool**
2. **post_review tool**
3. **Audit logging**
4. **E2E tests**

---

## 🐛 Debugging Guidelines

### Logging Levels:
- **ERROR**: Failed operations, exceptions
- **WARN**: Retries, degraded functionality
- **INFO**: Successful operations, state changes
- **DEBUG**: Detailed flow, GitHub API calls

### Debug Commands:
```bash
LOG_LEVEL=debug npm run dev     # Verbose logging
DRY_RUN=true npm run dev        # Safe testing
npm run test:watch              # Continuous testing
```

### Common Issues:
- **GitHub rate limits**: Check headers, implement backoff
- **Database locks**: Use transactions, retry logic
- **File encoding**: Handle UTF-8 vs binary properly
- **Branch conflicts**: Check if branch exists before creating

---

## ✅ Definition of Done

### For Each Tool:
- [ ] Zod schema validation implemented
- [ ] Error handling with proper types
- [ ] Unit tests with >80% coverage
- [ ] Integration test with mocked GitHub
- [ ] Audit logging implemented
- [ ] Dry-run mode supported
- [ ] Documentation updated

### For Each PR:
- [ ] All tests passing
- [ ] No TypeScript errors
- [ ] No linting errors
- [ ] README updated if needed
- [ ] Environment variables documented
- [ ] Security checklist completed

---

## 🎯 Success Metrics

**MVP Success:**
- All 7 MCP tools working
- E2E demo script passes
- Can create task → claim → branch → commit → PR
- Comprehensive error handling
- Production-ready Docker build

**Quality Gates:**
- Test coverage >80%
- No HIGH/CRITICAL security issues
- All TypeScript strict mode
- Zero runtime errors in happy path

---

Remember: **Ship fast, but ship safe.** Every line of code should move us toward a production-ready MCP server that enables rapid product development.