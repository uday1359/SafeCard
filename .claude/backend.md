# BACKEND DEVELOPMENT RULES

## 1. Backend Scope
- These rules apply only to backend development.
- Backend code MUST follow the existing project architecture.
- Before modifying code, Claude MUST inspect the existing backend structure.
- Claude MUST reuse existing services, utilities, middleware, and modules whenever possible.
- Claude MUST NOT modify frontend code unless explicitly requested.
- Claude MUST NOT modify unrelated backend functionality.
- Claude MUST preserve existing API behavior unless the requirement specifically requires a change.

---

## 2. Backend Project Structure
Use the following structure when appropriate:

```
backend/
│
├── src/
│   │
│   ├── config/
│   │   ├── database.ts
│   │   ├── environment.ts
│   │   └── app.config.ts
│   │
│   ├── controllers/
│   │   ├── auth.controller.ts
│   │   ├── user.controller.ts
│   │   └── product.controller.ts
│   │
│   ├── services/
│   │   ├── auth.service.ts
│   │   ├── user.service.ts
│   │   └── product.service.ts
│   │
│   ├── repositories/
│   │   ├── user.repository.ts
│   │   └── product.repository.ts
│   │
│   ├── models/
│   │   ├── user.model.ts
│   │   └── product.model.ts
│   │
│   ├── routes/
│   │   ├── auth.routes.ts
│   │   ├── user.routes.ts
│   │   └── product.routes.ts
│   │
│   ├── middleware/
│   │   ├── auth.middleware.ts
│   │   ├── error.middleware.ts
│   │   └── validation.middleware.ts
│   │
│   ├── validators/
│   │   ├── auth.validator.ts
│   │   ├── user.validator.ts
│   │   └── product.validator.ts
│   │
│   ├── types/
│   │   ├── user.types.ts
│   │   ├── auth.types.ts
│   │   └── api.types.ts
│   │
│   ├── utils/
│   │   ├── logger.ts
│   │   ├── response.ts
│   │   └── errors.ts
│   │
│   ├── database/
│   │   ├── migrations/
│   │   └── seeds/
│   │
│   ├── app.ts
│   └── server.ts
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── fixtures/
│
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

---

## 3. Folder Responsibility Rules

### config/
- MUST contain application configuration.
- Environment variables MUST be loaded through configuration.
- Configuration MUST NOT be duplicated throughout the application.

### controllers/
- Controllers MUST handle HTTP requests and responses.
- Controllers SHOULD remain thin.
- Business logic MUST NOT be placed directly inside controllers.
- Controllers SHOULD call services.

### services/
- Services MUST contain business logic.
- Services SHOULD be independent from HTTP-specific implementation.
- Repeated business logic MUST be centralized in services.
- Services MUST NOT contain unnecessary database connection logic.

### repositories/
- Repositories MUST handle database access when this architecture is used.
- Database queries SHOULD be isolated from business logic.
- Controllers MUST NOT directly contain database queries.
- Services SHOULD communicate with repositories where appropriate.

### models/
- Models MUST represent database entities/data structures.
- Models MUST follow the database schema.
- Models MUST NOT contain unrelated application logic.

### routes/
- Routes MUST define API endpoints.
- Routes MUST connect endpoints to controllers.
- Routes MUST use appropriate middleware.
- Route definitions MUST remain organized by feature.

### middleware/
- Middleware MUST handle cross-cutting request processing.
- Authentication middleware MUST be reusable.
- Validation middleware MUST be reusable.
- Error handling SHOULD be centralized.

### validators/
- Request validation MUST be centralized.
- Validate request body, parameters, and query parameters where required.
- Validation rules MUST be reusable.
- Invalid requests MUST return consistent errors.

### types/
- Shared backend types MUST be defined here when appropriate.
- Avoid duplicate type definitions.
- Do NOT use `any` unnecessarily.

### utils/
- Utilities MUST contain reusable helper functions.
- Utilities SHOULD remain generic.
- Do NOT place business logic in generic utility files.

---

## 4. Architecture Rules

Use this general flow:

```
Client ──► Route ──► Middleware ──► Controller ──► Service ──► Repository ──► Database
```

### Flow Rules:
- Routes MUST NOT contain business logic.
- Controllers MUST NOT contain complex business logic.
- Services MUST contain business logic.
- Database operations SHOULD be isolated in repositories.
- Middleware MUST be used for reusable request-processing concerns.
- Each layer MUST have a clear responsibility.
- Do NOT bypass layers without a valid architectural reason.

---

## 5. API Development Rules
- API endpoints MUST follow consistent naming conventions.
- HTTP methods MUST be used correctly:
  - `GET` → Retrieve data
  - `POST` → Create data
  - `PUT` → Replace/update data
  - `PATCH` → Partially update data
  - `DELETE` → Delete data
- Endpoints MUST return appropriate HTTP status codes.
- API responses MUST follow a consistent structure.
- API errors MUST follow a consistent structure.
- API contracts MUST remain backward compatible unless a breaking change is required.
- Do NOT expose internal implementation details in API responses.

---

## 6. HTTP Status Code Rules

Use appropriate status codes:

| Code | Meaning |
| :--- | :--- |
| **200** | Successful request |
| **201** | Resource created |
| **204** | Successful request with no response body |
| **400** | Invalid request |
| **401** | Authentication required/invalid |
| **403** | Access denied |
| **404** | Resource not found |
| **409** | Conflict |
| **422** | Validation failure |
| **429** | Too many requests |
| **500** | Internal server error |
| **503** | Service unavailable |

- Do NOT return `200` for every situation.

---

## 7. API Response Rules

Use a consistent response format.

### Success Example:
```json
{
  "success": true,
  "data": {},
  "message": "User retrieved successfully"
}
```

### Error Example:
```json
{
  "success": false,
  "error": {
    "code": "USER_NOT_FOUND",
    "message": "User not found"
  }
}
```

### Rules:
- Response structures MUST remain consistent.
- Error codes SHOULD be predictable.
- Sensitive internal information MUST NOT be returned.
- Stack traces MUST NOT be returned to clients in production.

---

## 8. Request Validation Rules
- Every external request MUST be treated as untrusted.
- Validate request body.
- Validate route parameters.
- Validate query parameters.
- Validate data types.
- Validate required fields.
- Validate minimum and maximum values.
- Validate string lengths.
- Validate allowed values.
- Reject malformed requests.
- Do NOT rely only on frontend validation.

---

## 9. Database Rules
- Database access MUST use the project's existing database architecture.
- Database credentials MUST NOT be hard-coded.
- Database queries MUST be parameterized or safely constructed.
- Do NOT build unsafe raw queries using direct user input.
- Database migrations MUST be version controlled.
- Database schema changes MUST use migrations where applicable.
- Avoid unnecessary database queries.
- Avoid N+1 query problems.
- Use transactions when multiple related operations must succeed or fail together.
- Database connections MUST be managed properly.

---

## 10. Authentication Rules
- Authentication logic MUST be centralized.
- Protected endpoints MUST use authentication middleware.
- Passwords MUST NEVER be stored as plain text.
- Passwords MUST be securely hashed.
- Authentication tokens MUST be handled securely.
- Authentication failures MUST return appropriate responses.
- Do NOT expose passwords or sensitive authentication information in API responses.
- Do NOT log passwords or authentication secrets.

---

## 11. Authorization Rules
- Authentication and authorization MUST be treated separately.
  - **Authentication** answers: *Who is the user?*
  - **Authorization** answers: *What can the user access?*
- Protected resources MUST verify user permissions.
- Role/permission checks SHOULD be centralized.
- Users MUST NOT be allowed to access resources they are not authorized to access.
- Never rely on frontend authorization alone.

---

## 12. Security Rules
- NEVER hard-code secrets.
- NEVER commit production credentials.
- NEVER log passwords.
- NEVER log authentication tokens.
- NEVER trust client input.
- Validate all external input.
- Protect authentication endpoints against abuse.
- Use secure password hashing.
- Use appropriate security headers where applicable.
- Configure CORS intentionally.
- Protect against injection attacks.
- Protect against unauthorized access.
- Do NOT expose database errors directly to clients.
- Do NOT expose stack traces in production.

---

## 13. Environment Configuration

Use environment variables:
- `.env`
- `.env.development`
- `.env.test`
- `.env.production`
- `.env.example`

### Rules:
- Environment-specific values MUST NOT be hard-coded.
- `.env.example` SHOULD contain required variable names without secrets.
- Production secrets MUST NOT be committed.
- Database URLs MUST come from configuration.
- API keys MUST come from secure environment configuration.
- Configuration MUST be centralized.

---

## 14. Error Handling Rules
- Backend errors MUST be handled centrally where possible.
- Use a global error-handling middleware.
- Errors MUST have meaningful error codes.
- User-facing error messages MUST be safe.
- Internal errors MUST be logged securely.
- Stack traces MUST NOT be exposed in production.
- Expected business errors SHOULD be distinguished from unexpected system errors.

---

## 15. Logging Rules
- Use a centralized logging system.
- Logs MUST contain useful debugging information.
- Do NOT log passwords.
- Do NOT log access tokens.
- Do NOT log sensitive personal information unnecessarily.
- Use appropriate log levels: `DEBUG`, `INFO`, `WARN`, `ERROR`.
- Production logging SHOULD avoid excessive debug output.

---

## 16. Security & Rate Limiting
- Authentication endpoints SHOULD have rate limiting.
- Sensitive endpoints SHOULD have appropriate abuse protection.
- Request payload sizes SHOULD be limited.
- File uploads MUST validate file type and size.
- Do NOT trust file extensions alone.
- API endpoints SHOULD have appropriate timeout handling.

---

## 17. Performance Rules
- Avoid unnecessary database queries.
- Use pagination for large datasets.
- Use appropriate indexes.
- Avoid N+1 queries.
- Cache expensive operations when appropriate.
- Avoid unnecessary external API calls.
- Use asynchronous operations correctly.
- Do NOT block the main execution path unnecessarily.
- Optimize only where it provides measurable value.

---

## 18. File Upload Rules
If the backend supports file uploads:
- Validate file size.
- Validate MIME type.
- Validate file extension.
- Do NOT trust user-provided filenames.
- Generate safe storage names.
- Prevent executable files from being uploaded where inappropriate.
- Store files using the project's approved storage strategy.
- Do NOT expose internal storage paths.

---

## 19. External API Rules
- External API communication MUST be isolated in services.
- API credentials MUST come from environment configuration.
- External API failures MUST be handled.
- Request timeouts SHOULD be configured.
- Retry logic SHOULD be used only when appropriate.
- Do NOT retry non-idempotent operations blindly.
- External API responses MUST be validated before use.

---

## 20. TypeScript Rules
If TypeScript is used:
- Avoid `any`.
- Define request types.
- Define response types.
- Define database/entity types where appropriate.
- Handle nullable values correctly.
- Avoid unnecessary type assertions.
- Use strict typing where the project supports it.
- Shared types MUST NOT be duplicated unnecessarily.

Example:
```typescript
interface CreateUserRequest {
  name: string;
  email: string;
  password: string;
}
```

---

## 21. Testing Rules
Backend features SHOULD include:
- Unit Tests
- Integration Tests
- API Tests
- Authentication Tests
- Authorization Tests
- Validation Tests
- Error Tests
- Database Tests

Test:
- Valid requests
- Invalid requests
- Missing fields
- Unauthorized requests
- Forbidden requests
- Non-existent resources
- Duplicate resources
- Boundary values
- Database failures
- External API failures

---

## 22. Naming Rules

| Layer | Naming Convention |
| :--- | :--- |
| **Controllers** | `auth.controller.ts`, `user.controller.ts`, `product.controller.ts` |
| **Services** | `auth.service.ts`, `user.service.ts`, `product.service.ts` |
| **Repositories** | `user.repository.ts`, `product.repository.ts` |
| **Routes** | `auth.routes.ts`, `user.routes.ts`, `product.routes.ts` |
| **Validators** | `auth.validator.ts`, `user.validator.ts` |
| **Middleware** | `auth.middleware.ts`, `error.middleware.ts`, `validation.middleware.ts` |

---

## 23. Code Quality Rules
- Functions MUST have a clear responsibility.
- Services MUST remain manageable in size.
- Controllers MUST remain thin.
- Avoid duplicated business logic.
- Avoid deeply nested conditions.
- Avoid unnecessary abstractions.
- Remove unused imports.
- Remove unused variables.
- Remove dead code.
- Use meaningful names.
- Keep modules focused.
- Follow the existing project coding style.

---

## 24. Git Rules
- Commit messages MUST be meaningful.
- Do NOT commit secrets.
- Do NOT commit `.env` files containing credentials.
- Review changed files before committing.
- Run tests before Pull Request creation.
- Run lint/type checks when available.
- Do NOT include unrelated changes in a feature commit.

Recommended format:
- `feat: add user registration API`
- `fix: handle duplicate email error`
- `refactor: extract user repository`
- `test: add authentication API tests`

---

## 25. Claude-Specific Backend Rules
When Claude is asked to create or modify backend code:
- Claude MUST inspect the existing backend structure first.
- Claude MUST identify the backend framework.
- Claude MUST identify the existing architecture.
- Claude MUST identify existing controllers, services, repositories, middleware, and utilities.
- Claude MUST reuse existing functionality before creating new functionality.
- Claude MUST follow existing naming conventions.
- Claude MUST follow existing API response conventions.
- Claude MUST follow existing error-handling conventions.
- Claude MUST NOT create duplicate services.
- Claude MUST NOT create duplicate API endpoints.
- Claude MUST NOT introduce unnecessary dependencies.
- Claude MUST NOT modify frontend code unless explicitly requested.
- Claude MUST NOT modify unrelated backend files.
- Claude MUST validate all external input.
- Claude MUST consider authentication and authorization.
- Claude MUST consider security implications.
- Claude MUST handle expected errors.
- Claude MUST add or update tests for important functionality.
- Claude MUST run available tests after making changes.
- Claude MUST run lint/type checks when available.
- Claude MUST verify the application builds successfully.
- Claude MUST report unresolved errors instead of claiming the task is complete.

---

## 26. Backend Definition of Done
Before Claude considers backend work complete:
- [ ] Requirement implemented
- [ ] Existing architecture followed
- [ ] Existing services reused where possible
- [ ] Correct controller created/modified
- [ ] Correct service created/modified
- [ ] Repository used where appropriate
- [ ] Request validation implemented
- [ ] Authentication checked
- [ ] Authorization checked
- [ ] Error handling implemented
- [ ] HTTP status codes verified
- [ ] API response format verified
- [ ] Database queries reviewed
- [ ] Security reviewed
- [ ] Sensitive data protected
- [ ] Environment variables used
- [ ] Logging reviewed
- [ ] Unit tests passed
- [ ] Integration/API tests passed
- [ ] Lint passed
- [ ] Type checks passed
- [ ] Build passed
- [ ] No unrelated files modified

---

## ⭐ Main Instruction for Claude
**BACKEND ONLY:**

Before changing backend code, inspect the existing backend project.

Follow the existing:
- Backend architecture
- Folder structure
- API conventions
- Database conventions
- Authentication system
- Authorization system
- Error handling
- Validation
- Logging
- TypeScript conventions
- Testing conventions

Reuse before creating.

Do not duplicate.

Do not bypass architectural layers without a valid reason.

Do not hard-code secrets.

Do not trust client input.

Do not expose sensitive information.

Do not modify frontend code unless explicitly requested.

Every backend change must be:
- Secure
- Validated
- Maintainable
- Testable
- Consistent
- Backward-compatible where possible
- Properly error-handled
