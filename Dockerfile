# TaskHub MCP Server - Production Dockerfile
# Multi-stage build with distroless final image for security

# Stage 1: Build stage
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Install build dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    && rm -rf /var/cache/apk/*

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./
COPY .eslintrc.js ./
COPY .prettierrc ./

# Install dependencies
RUN npm ci --only=production --ignore-scripts

# Copy source code
COPY src/ ./src/
COPY prisma/ ./prisma/

# Generate Prisma client
RUN npx prisma generate

# Build the application
RUN npm run build

# Stage 2: Production stage with distroless
FROM gcr.io/distroless/nodejs18-debian11:nonroot

# Set working directory
WORKDIR /app

# Copy built application from builder stage
COPY --from=builder --chown=nonroot:nonroot /app/dist ./dist
COPY --from=builder --chown=nonroot:nonroot /app/node_modules ./node_modules
COPY --from=builder --chown=nonroot:nonroot /app/prisma ./prisma
COPY --from=builder --chown=nonroot:nonroot /app/package.json ./package.json

# Set environment variables
ENV NODE_ENV=production
ENV LOG_LEVEL=info
ENV DATABASE_URL="file:./data/taskhub.db"

# Create data directory for SQLite
USER root
RUN mkdir -p /app/data && chown nonroot:nonroot /app/data
USER nonroot

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "const http = require('http'); \
    const options = { hostname: 'localhost', port: process.env.PORT || 3000, path: '/healthz', timeout: 5000 }; \
    const req = http.request(options, (res) => { \
        if (res.statusCode === 200) process.exit(0); \
        else process.exit(1); \
    }); \
    req.on('error', () => process.exit(1)); \
    req.end();"

# Expose port (will be configurable via environment)
EXPOSE 3000

# Run as non-root user
USER nonroot

# Start the application
CMD ["dist/server.js"]
