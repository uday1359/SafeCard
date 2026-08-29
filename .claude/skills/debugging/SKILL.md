---
name: debugging
description: Perform root-cause analysis and implement targeted fixes for identified bugs.
---

# Debugging

## Rules
- Reproduce the issue conceptually before attempting a fix.
- Check application logs and error stack traces.
- Do not apply "band-aid" fixes; identify and resolve the root cause.
- Ensure the fix does not introduce new regressions in related features.

## Workflow
1. Analyze the error message or bug report.
2. Trace the data flow to the point of failure.
3. Identify the faulty logic or assumption.
4. Implement a targeted fix.
5. Add a test case if applicable to prevent recurrence.

## Token Efficiency
- Use targeted searches (e.g., grep) for specific error strings or function names rather than reading entire modules.
