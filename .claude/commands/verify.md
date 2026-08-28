---
description: Typecheck, run the full test suite, and confirm the production build still succeeds
allowed-tools: Bash(npm run typecheck), Bash(npm test), Bash(npm run build)
---

Run the three checks that gate a change in this repo, in order, and stop at the first failure:

1. `npm run typecheck`
2. `npm test`
3. `npm run build`

Then report:

- Whether each step passed, with the actual counts (expected baseline: **38 passed, 3 skipped**).
- The bundle size from the build output, and whether it moved materially from the last known
  figure (326 kB raw / 108 kB gzipped).
- The realistic-card payload size printed by the size-budget test, against the 600-byte budget.

If the size-budget test failed, say so prominently rather than burying it — per CLAUDE.md that test
fails the build **on purpose** when a shared field is added without accounting for its cost. Treat
it as a design question to raise, not a threshold to relax.

Report failures with the real output. Do not describe a step as passing that you did not run.
