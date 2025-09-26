# TaskHub MCP Local Testing Guide

## 🚀 Quick Setup

### 1. Environment Setup
```bash
# Copy environment template
cp .env.example .env

# Edit .env with your values
nano .env
```

**Required Environment Variables:**
```bash
# GitHub Integration
GITHUB_TOKEN=ghp_your_personal_access_token_here
ALLOWED_REPOS=your-username/test-repo

# HTTP Transport (Phase 2.5)
TRANSPORTS=stdio,http
PORT=3000
JWT_SECRET=your-secret-key-here

# Safety Settings
DRY_RUN=true  # Set to false for real GitHub operations
```

### 2. Install and Build
```bash
npm install
npm run build
```

### 3. Database Setup
```bash
# Generate Prisma client and run migrations
npx prisma generate
npx prisma db push
```

## 🧪 Testing Scenarios

### **Scenario 1: Basic MCP Tools (stdio transport)**
```bash
# Start server in stdio mode
TRANSPORTS=stdio npm start

# In another terminal, test with MCP client
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node dist/server.js
```

### **Scenario 2: HTTP API Testing (Phase 2.5)**
```bash
# Start HTTP server
TRANSPORTS=http PORT=3000 npm start

# Test health check
curl http://localhost:3000/healthz

# Get demo token
curl -X POST http://localhost:3000/auth/demo-token

# Test task creation with authentication
TOKEN=$(curl -s -X POST http://localhost:3000/auth/demo-token | jq -r '.token')
curl -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -H "Idempotency-Key: test-$(date +%s)" \
     -X POST http://localhost:3000/mcp/tasks \
     -d '{
       "title": "Test Task",
       "description": "Testing the HTTP API",
       "acceptance_criteria": ["API works", "Tests pass"],
       "repo": "your-username/test-repo"
     }'
```

### **Scenario 3: Complete Workflow Testing**
```bash
# Run the comprehensive integration test
node scripts/test-chatgpt-integration.js

# Or run individual workflow steps
node scripts/demo-happy-path.js
```

### **Scenario 4: Phase 4.5 Features (Branch Naming & State Machine)**
```bash
# Start server
TRANSPORTS=http npm start

# Get token
TOKEN=$(curl -s -X POST http://localhost:3000/auth/demo-token | jq -r '.token')

# 1. Create task
TASK_RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: test-$(date +%s)" \
  -X POST http://localhost:3000/mcp/tasks \
  -d '{
    "title": "User Dashboard Feature",
    "description": "Build responsive user dashboard",
    "acceptance_criteria": ["Responsive design", "Charts display", "User data loads"],
    "repo": "your-username/test-repo"
  }')

TASK_ID=$(echo $TASK_RESPONSE | jq -r '.task_id')

# 2. Claim task (todo → claimed)
curl -H "Authorization: Bearer $TOKEN" \
     -H "Idempotency-Key: claim-$TASK_ID-$(date +%s)" \
     -X POST http://localhost:3000/mcp/tasks/$TASK_ID/claim \
     -d '{"assignee": "test-developer"}'

# 3. Start branch (claimed → in_progress) - Tests feature/{slug}-{task_id} naming
curl -H "Authorization: Bearer $TOKEN" \
     -H "Idempotency-Key: branch-$TASK_ID-$(date +%s)" \
     -X POST http://localhost:3000/mcp/tasks/$TASK_ID/branch \
     -d '{"dry_run": true}'

# Expected branch name: feature/user-dashboard-feature-{task_id}
```

## 🔍 Testing Phase 4.5 Features

### **Branch Naming Pattern Testing**
The system automatically generates branch names in the format: `feature/{slug}-{task_id}`

**Test Cases:**
```bash
# Test 1: Normal title
"User Dashboard Feature" → "feature/user-dashboard-feature-123"

# Test 2: Special characters
"Fix Bug: API/Auth Issues!" → "feature/fix-bug-api-auth-issues-124"

# Test 3: Long title (truncated to 40 chars)
"Very Long Task Title That Exceeds Reasonable Length" → "feature/very-long-task-title-that-exceeds-reason-125"
```

### **State Machine Testing**
```bash
# Valid transitions:
# todo → claimed → in_progress → review → done

# Test invalid transition (should fail)
curl -H "Authorization: Bearer $TOKEN" \
     -X POST http://localhost:3000/mcp/tasks/$TASK_ID/pr \
     -d '{"title": "Test PR"}' 
# Should fail if task is not in 'in_progress' state
```

## 🐛 Debugging

### **Check Logs**
```bash
# Enable debug logging
LOG_LEVEL=debug npm start

# Check database state
npx prisma studio
```

### **Common Issues**

1. **GitHub Token Issues**
   ```bash
   # Test token validity
   curl -H "Authorization: token $GITHUB_TOKEN" https://api.github.com/user
   ```

2. **Repository Access**
   ```bash
   # Verify repo is in ALLOWED_REPOS
   echo $ALLOWED_REPOS
   ```

3. **Database Issues**
   ```bash
   # Reset database
   rm dev.db
   npx prisma db push
   ```

## 📊 Test Results Validation

### **Expected Outputs**

1. **Health Check**: `{"status": "healthy", "version": "1.0.0"}`
2. **Branch Creation**: Returns branch name with `feature/{slug}-{task_id}` pattern
3. **State Transitions**: Only allows valid state changes
4. **PR Creation**: Includes checklist from acceptance criteria

### **Performance Testing**
```bash
# Load test the HTTP API
npm install -g autocannon
autocannon -c 10 -d 30 http://localhost:3000/healthz
```

## 🎯 Next Steps

After local testing:
1. Deploy to staging environment
2. Test with real GitHub repositories (set `DRY_RUN=false`)
3. Configure ChatGPT Actions using the provided schema
4. Implement Phase 3.5 (GitHub App Auth) if needed
