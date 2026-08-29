---
name: frontend-development
description: Frontend implementation following best practices for state management, component lifecycle, and DOM interaction.
---

# Frontend Development

## Rules
- Follow the established framework patterns (e.g., Hooks for React, Composition API for Vue).
- Keep components small and focused on a single responsibility.
- Avoid direct DOM manipulation if the framework provides data binding.
- Manage state effectively without unnecessary prop drilling or overusing global state.
- Ensure clean separation of logic and presentation.

## Workflow
1. Identify the component to be created or modified.
2. Determine necessary props and state.
3. Implement the logic and template.
4. Ensure styles are correctly applied or isolated.

## Token Efficiency
- Read only the components being actively modified and their immediate parents/children.
