# Security Policy

## Supported Versions

We actively support the following versions of TaskHub MCP Server:

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability, please follow these steps:

### 1. Do NOT create a public issue

Please do not report security vulnerabilities through public GitHub issues.

### 2. Report privately

Send an email to the maintainers with:
- A description of the vulnerability
- Steps to reproduce the issue
- Potential impact assessment
- Any suggested fixes (if available)

### 3. Response timeline

- **Initial response**: Within 48 hours
- **Status update**: Within 7 days
- **Fix timeline**: Depends on severity (see below)

## Severity Levels

### Critical (CVSS 9.0-10.0)
- **Response time**: Immediate (within 24 hours)
- **Fix timeline**: Within 7 days
- **Examples**: Remote code execution, authentication bypass

### High (CVSS 7.0-8.9)
- **Response time**: Within 48 hours
- **Fix timeline**: Within 14 days
- **Examples**: Privilege escalation, data exposure

### Medium (CVSS 4.0-6.9)
- **Response time**: Within 7 days
- **Fix timeline**: Within 30 days
- **Examples**: Information disclosure, DoS

### Low (CVSS 0.1-3.9)
- **Response time**: Within 14 days
- **Fix timeline**: Next minor release
- **Examples**: Minor information leaks

## Security Best Practices

### For Deployment

1. **Environment Variables**
   - Never commit secrets to version control
   - Use environment variables or secret management systems
   - Rotate GitHub tokens regularly

2. **Network Security**
   - Run behind a reverse proxy (nginx, Cloudflare)
   - Use HTTPS for all communications
   - Implement rate limiting

3. **Container Security**
   - Use the provided distroless Docker image
   - Run as non-root user (default in our image)
   - Keep base images updated
   - Scan images for vulnerabilities

4. **Access Control**
   - Use repository allowlists (`ALLOWED_REPOS`)
   - Implement least-privilege GitHub tokens
   - Consider GitHub App authentication for production

5. **Monitoring**
   - Enable audit logging
   - Monitor for unusual activity
   - Set up alerts for failed authentication

### For Development

1. **Dependencies**
   - Regularly update dependencies
   - Run `npm audit` before releases
   - Use Dependabot for automated updates

2. **Code Security**
   - Follow secure coding practices
   - Validate all inputs
   - Use TypeScript for type safety
   - Run security linters (ESLint security rules)

3. **Testing**
   - Include security test cases
   - Test with invalid/malicious inputs
   - Verify authentication and authorization

## Security Features

### Built-in Security

1. **Input Validation**
   - Zod schemas for all inputs
   - File size limits
   - Path traversal protection
   - Repository allowlists

2. **Error Handling**
   - No sensitive information in error messages
   - Proper error logging
   - Rate limiting on failures

3. **Authentication**
   - GitHub PAT or App authentication
   - Token validation
   - Scope verification

4. **Container Security**
   - Distroless base image
   - Non-root user
   - Read-only filesystem
   - Minimal attack surface

### Security Headers

When using HTTP transport (Phase 2.5), ensure these headers:

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains
Content-Security-Policy: default-src 'self'
```

## Vulnerability Disclosure

### Public Disclosure

After a vulnerability is fixed:

1. We will publish a security advisory
2. Credit will be given to the reporter (if desired)
3. A CVE may be requested for significant issues
4. Release notes will include security fixes

### Coordinated Disclosure

We follow responsible disclosure practices:

- 90-day disclosure timeline (from initial report)
- Extensions granted for complex issues
- Early disclosure for actively exploited vulnerabilities

## Security Contacts

For security-related questions or concerns:

- **Security issues**: Create a private security advisory on GitHub
- **General security questions**: Open a regular GitHub issue
- **Urgent security matters**: Contact maintainers directly

## Acknowledgments

We appreciate the security research community and will acknowledge researchers who help improve our security posture.

---

**Note**: This security policy is subject to change. Please check back regularly for updates.
