# TaskHub MCP Server - Production Deployment Guide

This guide covers deploying the TaskHub MCP server in production environments.

## 🚀 Quick Start

### Prerequisites

- Docker and Docker Compose
- GitHub Personal Access Token with `repo` scope
- Node.js 18+ (for local development)

### 1. Clone and Setup

```bash
git clone https://github.com/your-org/taskhub-mcp.git
cd taskhub-mcp
npm install
npm run build
```

### 2. Configure Environment

```bash
# Copy production template
cp .env.production .env

# Edit configuration
nano .env
```

**Required Configuration:**

```env
# GitHub Integration (REQUIRED)
GITHUB_TOKEN=ghp_your_token_here
ALLOWED_REPOS=your-org/repo1,your-org/repo2

# Security
DRY_RUN=false  # Set to false for real operations
NODE_ENV=production

# Database (SQLite default, PostgreSQL recommended for production)
DATABASE_URL="file:./data/taskhub.db"
# DATABASE_URL="postgresql://user:pass@localhost:5432/taskhub"

# Transport Configuration (Phase 2.5)
TRANSPORTS=stdio,http  # Enable both stdio and HTTP transports
PORT=3000              # HTTP server port
BASE_PATH=/mcp         # HTTP API base path

# JWT Authentication (Phase 2.5)
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_TTL_MIN=30         # Token TTL in minutes

# Idempotency (Phase 2.5)
IDEMPOTENCY_REQUIRED=false  # Set to true to require idempotency keys
```

### 3. Deploy with Docker

```bash
# Build and deploy
./scripts/deploy.sh deploy

# Check status
./scripts/deploy.sh health

# View logs
./scripts/deploy.sh logs
```

## 📋 Deployment Options

### Option 1: Docker Compose (Recommended)

**Advantages:**
- Easy setup and management
- Built-in health checks
- Volume persistence
- Resource limits

**Use case:** Small to medium deployments, development environments

```bash
# Start services
docker-compose up -d

# Scale if needed
docker-compose up -d --scale taskhub-mcp=2
```

### Option 2: Kubernetes

**Advantages:**
- High availability
- Auto-scaling
- Service mesh integration
- Enterprise features

**Use case:** Large deployments, enterprise environments

```yaml
# k8s/deployment.yaml (example)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: taskhub-mcp
spec:
  replicas: 3
  selector:
    matchLabels:
      app: taskhub-mcp
  template:
    metadata:
      labels:
        app: taskhub-mcp
    spec:
      containers:
      - name: taskhub-mcp
        image: ghcr.io/your-org/taskhub-mcp:latest
        ports:
        - containerPort: 3000
        env:
        - name: GITHUB_TOKEN
          valueFrom:
            secretKeyRef:
              name: github-secrets
              key: token
        resources:
          limits:
            memory: "512Mi"
            cpu: "1000m"
          requests:
            memory: "128Mi"
            cpu: "250m"
```

### Option 3: Serverless (Future)

**Advantages:**
- Zero maintenance
- Pay-per-use
- Auto-scaling
- Global distribution

**Use case:** Event-driven workflows, cost optimization

*Note: Requires Phase 2.5 (HTTP transport) implementation*

## 🔧 Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | Yes | `production` | Runtime environment |
| `GITHUB_TOKEN` | Yes | - | GitHub PAT with repo scope |
| `ALLOWED_REPOS` | Yes | - | Comma-separated repo list |
| `DATABASE_URL` | No | `file:./data/taskhub.db` | Database connection |
| `DRY_RUN` | No | `true` | Safe mode for testing |
| `LOG_LEVEL` | No | `info` | Logging verbosity |
| `MAX_PATCH_BYTES` | No | `200000` | File size limit |

### GitHub Token Setup

1. **Create Personal Access Token:**
   - Go to GitHub Settings → Developer settings → Personal access tokens
   - Generate new token (classic)
   - Select scopes: `repo`, `contents`, `pull_requests`
   - Copy token securely

2. **Repository Access:**
   - Add repositories to `ALLOWED_REPOS`
   - Format: `owner/repo1,owner/repo2`
   - Supports wildcards: `your-org/*`

3. **Security Best Practices:**
   - Use fine-grained tokens when available
   - Rotate tokens regularly (90 days)
   - Monitor token usage in GitHub settings

### Database Configuration

#### SQLite (Default)

```env
DATABASE_URL="file:./data/taskhub.db"
```

**Pros:** Simple setup, no external dependencies
**Cons:** Single instance, limited concurrency
**Use case:** Development, small deployments

#### PostgreSQL (Recommended)

```env
DATABASE_URL="postgresql://username:password@localhost:5432/taskhub?schema=public"
```

**Pros:** High performance, concurrent access, backup support
**Cons:** Requires external database
**Use case:** Production deployments

```bash
# Setup PostgreSQL with Docker
docker run -d \
  --name taskhub-postgres \
  -e POSTGRES_DB=taskhub \
  -e POSTGRES_USER=taskhub \
  -e POSTGRES_PASSWORD=secure_password \
  -v postgres_data:/var/lib/postgresql/data \
  postgres:15-alpine

# Update docker-compose.yml to use PostgreSQL profile
docker-compose --profile postgres up -d
```

## 🔒 Security

### Container Security

The provided Docker image follows security best practices:

- **Distroless base image** (minimal attack surface)
- **Non-root user** (uid 65532)
- **Read-only filesystem** (except /tmp)
- **No shell access** (distroless)
- **Minimal dependencies** (only Node.js runtime)

### Network Security

```bash
# Reverse proxy with nginx
server {
    listen 443 ssl http2;
    server_name taskhub.yourdomain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Secrets Management

**Docker Secrets:**
```bash
# Create secrets
echo "ghp_your_token" | docker secret create github_token -

# Use in compose
services:
  taskhub-mcp:
    secrets:
      - github_token
    environment:
      - GITHUB_TOKEN_FILE=/run/secrets/github_token
```

**Kubernetes Secrets:**
```bash
# Create secret
kubectl create secret generic github-secrets \
  --from-literal=token=ghp_your_token

# Reference in deployment (see k8s example above)
```

## 📊 Monitoring

### Health Checks

The server provides built-in health monitoring:

```bash
# Docker health check
curl http://localhost:3000/healthz

# Response
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z",
  "version": "1.0.0",
  "uptime": 3600
}
```

### Logging

Structured JSON logs with PII redaction:

```json
{
  "level": "info",
  "time": "2024-01-15T10:30:00.000Z",
  "msg": "Task created successfully",
  "event": "task_created",
  "task_id": 123,
  "assignee": "user1",
  "repo": "org/repo"
}
```

**Log aggregation:**
```bash
# ELK Stack
docker run -d \
  --name elasticsearch \
  -p 9200:9200 \
  elasticsearch:8.11.0

# Fluentd for log shipping
# Kibana for visualization
```

### Metrics

**Prometheus integration (future):**
- Request duration
- Error rates
- GitHub API usage
- Database performance

## 🚀 CI/CD

### GitHub Actions

The repository includes a complete CI/CD pipeline:

```yaml
# .github/workflows/ci.yml
- Lint and type checking
- Unit and integration tests
- Security scanning (Trivy)
- Docker build and test
- Automated deployment
```

### Deployment Pipeline

```bash
# Manual deployment
git push origin main

# Automated deployment (on main branch)
# 1. Tests pass
# 2. Security scan passes
# 3. Docker image built
# 4. Image pushed to registry
# 5. Production deployment triggered
```

## 🔧 Troubleshooting

### Common Issues

**1. GitHub API Rate Limits**
```bash
# Check rate limit status
curl -H "Authorization: token $GITHUB_TOKEN" \
  https://api.github.com/rate_limit

# Solution: Use GitHub App authentication (Phase 3.5)
```

**2. Database Connection Issues**
```bash
# Check database connectivity
docker exec taskhub-mcp-server node -e "
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  prisma.\$connect().then(() => console.log('Connected')).catch(console.error);
"
```

**3. Container Won't Start**
```bash
# Check logs
docker logs taskhub-mcp-server

# Common causes:
# - Missing environment variables
# - Invalid GitHub token
# - Database connection failure
# - Port conflicts
```

### Debug Mode

```bash
# Enable debug logging
docker run -e LOG_LEVEL=debug taskhub-mcp

# Enable dry run mode
docker run -e DRY_RUN=true taskhub-mcp
```

## 📈 Scaling

### Horizontal Scaling

```bash
# Docker Compose
docker-compose up -d --scale taskhub-mcp=3

# Kubernetes
kubectl scale deployment taskhub-mcp --replicas=5
```

### Load Balancing

```nginx
upstream taskhub_backend {
    server localhost:3001;
    server localhost:3002;
    server localhost:3003;
}

server {
    location / {
        proxy_pass http://taskhub_backend;
    }
}
```

### Database Scaling

```bash
# PostgreSQL read replicas
# Redis for caching
# Connection pooling
```

## 🔄 Backup and Recovery

### Database Backup

```bash
# SQLite
cp data/taskhub.db backup/taskhub-$(date +%Y%m%d).db

# PostgreSQL
pg_dump taskhub > backup/taskhub-$(date +%Y%m%d).sql
```

### Disaster Recovery

```bash
# Automated backups
# Cross-region replication
# Point-in-time recovery
```

## 📞 Support

- **Documentation:** [README.md](./README.md)
- **Security:** [SECURITY.md](./SECURITY.md)
- **Issues:** GitHub Issues
- **Discussions:** GitHub Discussions

---

**Next Steps:**
1. Deploy in staging environment
2. Run integration tests
3. Monitor performance
4. Plan Phase 2.5 (HTTP transport)
5. Consider GitHub App authentication
