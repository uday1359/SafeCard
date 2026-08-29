---
name: testing
description: Write and maintain test cases to verify application behavior and prevent regressions.
---

# Testing

## Rules
- Write tests for all new core business logic.
- Use clear, descriptive names for test cases.
- Follow the Arrange-Act-Assert (AAA) pattern.
- Mock external dependencies and network requests to ensure tests are deterministic.
- Do not write fragile tests that break on minor UI changes.

## Workflow
1. Identify the behavior to be tested.
2. Set up the test environment and mocks.
3. Execute the code under test.
4. Assert the expected outcomes.
5. Clean up any test state.

## Token Efficiency
- Review existing test files to understand the testing framework and patterns before writing new ones.
