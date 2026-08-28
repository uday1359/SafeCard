---
description: Re-measure the QR payload size and Argon2id cost against their Phase 0 budgets
allowed-tools: Bash(npx vitest *), Bash(npm test)
---

Re-run the Phase 0 measurements and compare them to the figures recorded in README.md.

On Windows/PowerShell the `npm run test:phase0` script fails, because it uses the POSIX env-var
prefix form. Use:

```
$env:PHASE0_BENCH=1; npx vitest run test/phase0-report.test.ts
```

On macOS/Linux `npm run test:phase0` works as written.

Report a comparison table against the recorded baseline:

| Measure | Baseline | Now |
|---|---|---|
| Minimal card | 137 B | |
| Realistic card | 296 B | |
| Heavy card | 380 B | |
| Argon2id m=32 MiB, t=3 | 136 ms | |

Budgets: **600 bytes** for the payload, **1.5 s** for the KDF.

Two things to flag if you see them:

- Payload growth. Headroom is what pays for future fields; a shrinking margin is the story, not
  just an absolute number under budget.
- `estimatePayloadSize()` drifting from the real encoded length. These must stay **exactly** equal —
  the live capacity meter reads the estimate, so drift means the meter shows green right up until
  generation fails. There is a test asserting exact equality; if it failed, lead with that.

Timing numbers vary between runs and machines. Report what you measured, and do not present a
desktop figure as evidence about low-end phones — that gate still needs real hardware.
