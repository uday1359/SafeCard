---
name: security
description: Ensure application security by preventing common vulnerabilities and handling sensitive data safely.
---

# Security

## Rules
- Never hardcode secrets, API keys, or passwords.
- Sanitize all user inputs to prevent XSS and SQL Injection.
- Enforce proper authentication and authorization checks on sensitive operations.
- Follow the principle of least privilege.
- Use safe cryptography practices (e.g., hashing passwords with salt).

## Workflow
1. Review the data flow for sensitive information.
2. Ensure inputs are sanitized and outputs are escaped.
3. Verify access control checks are in place.

## Token Efficiency
- Focus specifically on authentication middleware, data sanitization utilities, and affected models.
