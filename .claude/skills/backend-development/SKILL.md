---
name: backend-development
description: Backend and API implementation focusing on data integrity, performance, and clear contracts.
---

# Backend Development

## Rules
- Validate all incoming data at the API boundary.
- Keep business logic decoupled from routing/transport layers.
- Use efficient database queries; avoid N+1 query problems.
- Return consistent HTTP status codes and standard error payloads.
- Do not log sensitive user data.

## Workflow
1. Define the API contract/endpoint.
2. Implement data validation.
3. Write core business logic.
4. Implement data access layer/queries.
5. Handle errors and format the response.

## Token Efficiency
- Focus on the specific route, controller, and model files being changed.
