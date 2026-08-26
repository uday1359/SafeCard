---
description: Run the seven validation gates and report which security properties are actually proven
allowed-tools: Bash(npx vitest *), Bash(npm test)
---

Run the validation-gate tests:

```
npx vitest run -t "validation gates"
```

Add `npx vitest run test/codec.test.ts` if you need the tamper and round-trip tests alongside them.

Then report gate by gate. The seven are split across two functions — `decodeHeader()` runs 1–5
**before any key derivation**, `decodePayload()` runs 6 and 7:

| Gate | Runs in | What it proves |
|---|---|---|
| 1–4 | `decodeHeader()` | Structural: length, magic, `fmtVersion`, field ranges |
| 5 | `decodeHeader()` | KDF parameters are in range **before** memory is allocated |
| 6 | `decodePayload()` | GCM tag verifies — authenticity and header binding via AAD |
| 7 | `decodePayload()` | Inflate + CBOR decode succeed |

Three properties matter more than the pass count. Say explicitly whether each is still proven:

1. **Gate 5 rejects before allocating.** The header is attacker-controlled until the tag verifies,
   and the tag cannot verify until after the KDF has run. A hostile QR declaring 4 GiB of Argon2
   memory must be refused without ever allocating. The test verifies this **by timing**, not just by
   outcome — a test that only checks the error would pass even if the allocation happened first.
   There is a lower bound too, against a hostile *generator* downgrading the cost.
2. **Gates 6 and 7 do not leak which failed.** A wrong share code and a tampered payload must
   produce byte-identical user-facing messages (spec section 18). Check that `DecodeError` keeps
   developer detail in `.message` and user-safe text in `.userMessage` — and that no UI code renders
   `.message`.
3. **Header tampering fails closed.** This is what proves the AAD binding is real; without it the
   header could be edited while the ciphertext still verified.

If a gate test fails, quote the actual assertion. Do not soften a failure here — these are the
security controls, not smoke tests.
