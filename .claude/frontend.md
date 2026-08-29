# FRONTEND DEVELOPMENT RULES

## 1. Frontend Scope
- These rules apply only to frontend development.
- Frontend code **MUST** follow the existing frontend architecture.
- Before modifying code, Claude **MUST** inspect the existing frontend structure.
- Claude **MUST** reuse existing frontend components whenever possible.
- Claude **MUST NOT** modify backend code unless explicitly requested.
- Claude **MUST NOT** create duplicate UI components.
- Claude **MUST NOT** change unrelated frontend functionality.

---

## 2. Frontend Project Structure
Use this structure when the project architecture allows it:

```text
src/
│
├── assets/
│   ├── images/
│   ├── icons/
│   └── fonts/
│
├── components/
│   ├── common/
│   │   ├── Button/
│   │   ├── Input/
│   │   ├── Select/
│   │   ├── Modal/
│   │   ├── Card/
│   │   ├── Loader/
│   │   └── EmptyState/
│   │
│   └── layout/
│       ├── Header/
│       ├── Navbar/
│       ├── Sidebar/
│       └── Footer/
│
├── pages/
│   ├── Login/
│   ├── Register/
│   ├── Dashboard/
│   └── Profile/
│
├── features/
│   ├── authentication/
│   ├── dashboard/
│   └── users/
│
├── hooks/
│
├── services/
│
├── store/
│
├── types/
│
├── utils/
│
├── routes/
│
└── styles/
    ├── globals.css
    ├── variables.css
    └── responsive.css
```

### Structure Rules
- `components/common/` **MUST** contain reusable UI components.
- `components/layout/` **MUST** contain reusable layout components.
- `pages/` **MUST** contain page-level UI.
- `features/` **MUST** contain feature-specific frontend functionality.
- `hooks/` **MUST** contain reusable frontend hooks.
- `services/` **MUST** contain frontend API communication logic when required.
- `store/` **MUST** contain frontend application state.
- `types/` **MUST** contain TypeScript types.
- `utils/` **MUST** contain reusable frontend utility functions.
- `styles/` **MUST** contain global frontend styles and design tokens.
- **Do NOT** place page-specific components inside `components/common/`.
- **Do NOT** create a new folder when an existing folder is appropriate.

---

## 3. Component Rules
- Components **MUST** have one clear responsibility.
- Components **SHOULD** be small and reusable.
- Components **MUST** use meaningful names.
- Component names **MUST** use PascalCase.
- Repeated UI **MUST** be converted into reusable components.
- Components **MUST** use typed props when using TypeScript.
- Components **MUST NOT** contain unnecessary duplicated code.
- Components **MUST NOT** contain unrelated functionality.
- Existing components **MUST** be reused before creating new components.
- **Do NOT** create multiple components that perform the same UI function.

---

## 4. Page Rules
- Pages **MUST** focus on composing components.
- Pages **SHOULD NOT** contain large amounts of repeated UI code.
- Page-specific components **SHOULD** be placed inside the appropriate page or feature folder.
- Pages **MUST** have responsive layouts.
- Pages **MUST** handle appropriate loading, empty, and error UI states.
- Pages **MUST** maintain consistent spacing and alignment.
- Pages **MUST** follow the application's design system.

---

## 5. Color Selection Rules

### 5.1 General Color Rule
- The frontend **MUST** use a consistent color palette.
- Claude **MUST** inspect existing colors before introducing new colors.
- Existing project colors **MUST** be reused whenever possible.
- Claude **MUST NOT** randomly select colors for different components.
- Similar UI elements **MUST** use the same color tokens.
- Colors **MUST** be defined centrally instead of repeatedly hard-coded throughout components.

### 5.2 Color Palette Structure
Use design variables/tokens:

```css
:root {
  --color-primary: #2563eb;
  --color-secondary: #64748b;

  --color-background: #ffffff;
  --color-surface: #f8fafc;

  --color-text-primary: #111827;
  --color-text-secondary: #6b7280;

  --color-border: #e5e7eb;

  --color-success: #16a34a;
  --color-warning: #f59e0b;
  --color-error: #dc2626;
  --color-info: #0284c7;
}
```

Claude **SHOULD** use variables:
```css
color: var(--color-text-primary);
background: var(--color-primary);
border-color: var(--color-border);
```
Instead of repeatedly using:
```css
color: #111827;
background: #2563eb;
```

---

## 6. Color Meaning Rules
Use colors consistently:

| Color | Purpose | Usage |
| :--- | :--- | :--- |
| **Primary** | Main actions | Primary buttons, important links |
| **Secondary** | Secondary actions | Supporting UI |
| **Background** | App canvas | Main application background |
| **Surface** | Content containers | Cards, panels, inputs |
| **Text Primary** | Main readability | Main readable content |
| **Text Secondary** | Subtitle/caption | Supporting information |
| **Border** | Structure | Dividers and component boundaries |
| **Success** | Positive state | Successful operations |
| **Warning** | Cautionary state | Warning messages |
| **Error** | Destructive state | Validation and error messages |
| **Info** | Informational state | Informational messages |

### Rules:
- Primary color **MUST** be used consistently for primary actions.
- Error color **MUST** be reserved for errors and destructive validation states.
- Success color **MUST** be used for successful states.
- Warning color **MUST** be used for warnings.
- Colors **MUST NOT** be used randomly for decoration.
- Destructive actions **SHOULD** have a visually distinct style.
- Text and background colors **MUST** provide sufficient contrast.

---

## 7. Color Selection Before Development
When a new project has no existing color system, Claude **MUST** first establish a simple palette:
- Primary Color
- Secondary Color
- Background Color
- Surface Color
- Text Primary
- Text Secondary
- Border Color
- Success Color
- Warning Color
- Error Color
- Info Color

- Claude **MUST** use the selected palette consistently throughout the frontend.
- Claude **MUST NOT** introduce a different primary color on individual pages unless explicitly requested.

---

## 8. Dark Mode Rules
If dark mode is required:
- Dark mode **MUST** use separate design tokens.
- Components **MUST NOT** manually change colors individually.
- Text **MUST** remain readable.
- Borders **MUST** remain visible.
- Cards and surfaces **MUST** remain visually distinguishable.
- Images and icons **MUST** remain visible.
- Existing light-mode functionality **MUST** continue working.

Example:
```css
:root {
  --color-background: #ffffff;
  --color-surface: #f8fafc;
  --color-text-primary: #111827;
}

[data-theme="dark"] {
  --color-background: #0f172a;
  --color-surface: #1e293b;
  --color-text-primary: #f8fafc;
}
```

---

## 9. Typography Rules
- The frontend **MUST** use a consistent typography system.
- Font families **MUST** be defined centrally.
- Heading sizes **MUST** be consistent.
- Body text **MUST** remain readable.
- **Do NOT** use excessive font sizes.
- **Do NOT** use too many different font families.
- Font weights **MUST** follow the design system.
- Line height **MUST** be appropriate for readability.

Example:
```css
:root {
  --font-family: "Inter", sans-serif;

  --font-size-xs: 12px;
  --font-size-sm: 14px;
  --font-size-md: 16px;
  --font-size-lg: 18px;
  --font-size-xl: 24px;
  --font-size-2xl: 32px;
}
```

---

## 10. Spacing Rules
- Use a consistent spacing system.
- Avoid random margins and padding.
- Similar components **MUST** have consistent spacing.
- Use spacing variables where appropriate.

Example:
```css
:root {
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --spacing-xl: 32px;
}
```

---

## 11. Responsive UI Rules
- Every frontend page **MUST** be responsive.
- Support mobile, tablet, and desktop layouts.
- **Do NOT** design only for desktop.
- **Do NOT** use unnecessary fixed widths.
- Content **MUST** adapt to smaller screens.
- Buttons **MUST** remain usable on mobile.
- Forms **MUST** remain usable on mobile.
- Navigation **MUST** have an appropriate mobile layout.
- Tables **MUST** have a responsive solution.
- Images **MUST** scale appropriately.

---

## 12. Form UI Rules
- Form fields **MUST** have clear labels.
- Required fields **MUST** be visually identifiable.
- Validation messages **MUST** be clear.
- Error messages **MUST** appear close to the relevant field.
- Invalid fields **SHOULD** have a clear visual state.
- Submit buttons **MUST** show an appropriate loading state.
- Submit buttons **MUST** prevent accidental duplicate submissions.
- Inputs **MUST** have appropriate placeholder text where useful.
- Input fields **MUST** have visible focus states.
- Forms **MUST** work on mobile devices.

---

## 13. Button Rules
Use consistent button variants:
- Primary
- Secondary
- Success
- Danger
- Outline
- Ghost
- Disabled
- Loading

### Rules:
- Reuse the common Button component.
- **Do NOT** create a new button style for every page.
- Primary actions **MUST** use the primary button style.
- Destructive actions **MUST** use the danger style.
- Disabled buttons **MUST** be visually distinguishable.
- Loading buttons **MUST** clearly indicate that an operation is in progress.

---

## 14. Accessibility Rules
- All interactive elements **MUST** be keyboard accessible.
- Form inputs **MUST** have accessible labels.
- Images **MUST** have appropriate alt text.
- Buttons **MUST** have meaningful names.
- Focus states **MUST** be visible.
- Color **MUST NOT** be the only way to communicate status.
- Text **MUST** have sufficient contrast.
- Modals **MUST** support keyboard interaction.
- Navigation **MUST** be keyboard accessible.
- Accessibility **MUST** be considered for every new component.

---

## 15. Icons Rules
- Use the project's existing icon library when available.
- **Do NOT** mix multiple icon libraries unnecessarily.
- Icons **MUST** have consistent sizing.
- Icons used as actions **MUST** have accessible labels.
- **Do NOT** use random Unicode symbols as UI icons when a proper icon component exists.
- Icons **MUST** visually match the overall design.

---

## 16. Image Rules
- Images **MUST** be optimized.
- Use appropriate image dimensions.
- Avoid unnecessarily large image files.
- Use meaningful alt text when appropriate.
- Images **MUST** not break responsive layouts.
- Use existing project assets before adding duplicates.
- **Do NOT** use placeholder images in production UI unless explicitly required.

---

## 17. UI State Rules
Every interactive frontend component **SHOULD** consider:
- Default
- Hover
- Focus
- Active
- Disabled
- Loading
- Success
- Error
- Empty

### Example:
```text
Button
├── Default
├── Hover
├── Focus
├── Active
├── Disabled
└── Loading
```

---

## 18. Frontend Code Quality
- Avoid duplicate code.
- Avoid huge components.
- Avoid huge functions.
- Avoid deeply nested conditions.
- Avoid unnecessary abstractions.
- Remove unused imports.
- Remove unused variables.
- Remove debugging code.
- Use meaningful variable names.
- Keep functions focused.
- Keep components focused.
- Follow DRY principles where appropriate.

---

## 19. Frontend State Rules
- Use local state when state belongs to one component.
- Use shared state only when required.
- **Do NOT** put every UI value into global state.
- Avoid duplicate state values.
- Keep state predictable.
- Loading, error, and success states **MUST** be represented clearly in the UI.

---

## 20. Frontend API Integration Rules
- API integration **MUST** be separated from UI components where practical.
- Components **SHOULD** call frontend services/hooks instead of containing repeated request logic.
- API loading states **MUST** be displayed.
- API errors **MUST** be displayed appropriately.
- Empty API responses **MUST** have an appropriate UI.
- API response data **MUST** be safely handled.
- API URLs **MUST** use the project's configuration system.

---

## 21. Frontend Testing Rules
- Important components **MUST** have appropriate tests.
- Forms **MUST** test validation behavior.
- Buttons **MUST** test important interactions.
- Loading states **SHOULD** be tested.
- Error states **SHOULD** be tested.
- Empty states **SHOULD** be tested.
- Important user flows **SHOULD** have end-to-end tests.
- Responsive UI **SHOULD** be verified for important pages.

---

## 22. Claude-Specific Frontend Rules
When Claude is asked to create or modify frontend code:
- **MUST** inspect the existing frontend structure first.
- **MUST** identify the existing design system.
- **MUST** identify existing colors before selecting new colors.
- **MUST** reuse existing components.
- **MUST** reuse existing CSS/design tokens.
- **MUST** follow existing naming conventions.
- **MUST** follow the existing framework architecture.
- **MUST NOT** create duplicate components.
- **MUST NOT** randomly introduce new colors.
- **MUST NOT** randomly introduce new fonts.
- **MUST NOT** randomly introduce new spacing values.
- **MUST NOT** modify unrelated frontend files.
- **MUST NOT** modify backend code unless explicitly requested.
- **MUST** ensure responsive behavior.
- **MUST** consider accessibility.
- **MUST** handle relevant loading/error/empty states.
- **MUST** test the modified frontend functionality.
- **MUST** fix frontend errors before declaring the task complete.

---

## 23. Frontend Definition of Done
Before Claude considers frontend work complete:

- [ ] Correct frontend component created/modified
- [ ] Existing component reused where possible
- [ ] Project structure followed
- [ ] Existing color palette followed
- [ ] No unnecessary colors introduced
- [ ] Typography is consistent
- [ ] Spacing is consistent
- [ ] Responsive design implemented
- [ ] Mobile layout checked
- [ ] Desktop layout checked
- [ ] Accessibility considered
- [ ] Form validation handled
- [ ] Loading state handled
- [ ] Error state handled
- [ ] Empty state handled
- [ ] Hover state handled
- [ ] Focus state handled
- [ ] Disabled state handled
- [ ] No duplicate code
- [ ] No unused imports
- [ ] No console/debug code
- [ ] Frontend tests passed
- [ ] Frontend build passed
- [ ] No unrelated files modified

---

## ⭐ Main Instruction for Claude
**FRONTEND ONLY:**

Before changing any frontend code, inspect the existing project.

Follow the existing:
- Project structure
- Components
- Design system
- Color palette
- Typography
- Spacing
- Responsive patterns
- Accessibility patterns
- Coding conventions

**Reuse before creating.**  
**Do not duplicate.**  
**Do not randomly choose colors.**  
**Do not introduce unnecessary dependencies.**  
**Do not modify backend code unless explicitly requested.**

Every new UI must be:
- Reusable
- Responsive
- Accessible
- Consistent
- Maintainable
- Tested
