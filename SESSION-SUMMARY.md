# Session Summary

What was asked, and what was delivered.

---

## 1. Plan the project

> "go through content of md file give me best technologies... with memory management... and decide
> the phases or step by step or give me suitable tasks"

- Read the 59-section spec, researched the 2026 package landscape.
- Chose a stack, wrote memory-management rules and a phased plan.
- **Corrected the spec:** Isar is unmaintained → use Drift. `mobile_scanner` has no Windows support.
- **Flagged a design flaw:** the spec's 4-digit QR password is crackable offline in under a second.
  You chose a generated ~40-bit share code instead.
- **Re-ordered the phases** to attack risk first — the spec left the crypto/QR question until after
  all the UI was built.
- Blocked: no Flutter SDK installed. Wrote setup docs + bootstrap script instead.

## 2. Switch to web

> "I want in webapplication"

- Reworked the plan — web changes the security model, not just the UI.
- **Worse:** host can push new JS on any load; browser storage is evictable.
- **Better:** the Windows scanning problem vanishes; non-extractable `CryptoKey` beats native;
  WebAuthn PRF beats a PIN.
- Node was already installed, so the work became buildable.
- **Built and tested the crypto core** — codec, wire format, 7 validation gates.
- Measured: **296 B payload** (600 B budget), **Argon2id 136 ms** (1.5 s budget).

## 3. Run it

> "run this application your self"

- Built the Vite + React app: two panels, owner and recipient.
- Server live; production build verified.
- No browser automation available, so proved it instead with an **end-to-end test through real QR
  pixels** decoded by zxing-wasm.
- **Fixed:** a dependency conflict (pinned, not forced), Node shims leaking into the browser bundle,
  and both WASM files moved off CDNs to first-party.

## 4. Add fields, colors, images

> "give me fields to enter the details... give the colors and images... improve website... run again
> give me link"

- **Real inputs** for every field: date picker, blood-group dropdown, add/remove contacts.
- **Visuals:** brand gradient, inline SVG logo + 10 icons, initials avatar, 3-state theme toggle.
  All inline — the CSP forbids external image hosts.
- **Added a live QR capacity meter** — exact bytes as you type, no KDF per keystroke. Turns the
  invisible size limit into something you can watch.
- Also: copy code, download PNG, print stylesheet, paste-a-screenshot, drag-over highlight.

## 5. `/init`

- Wrote `CLAUDE.md` covering commands, architecture, and the non-obvious invariants — especially the
  aliasing hazard that caused two real bugs.

---

## Two bugs found and fixed

| Bug | Why it mattered |
|---|---|
| `cardId` returned as four zero bytes | The wipe discipline zeroed a buffer the return value still pointed into |
| `cbor-x` returns a reused internal buffer | The next encode would overwrite the previous card's plaintext |

## State

```
Tests      38 passed | 3 skipped
Typecheck  clean
Build      326 kB / 108 kB gzipped
Running    http://localhost:5173
```

**Built:** codec, wire format, validation gates, owner/recipient UI.
**Not built:** app lock, storage, encrypted backup, camera scanning, service worker, KDF worker.
Nothing is persisted — reloading clears the form.

**Still needs real hardware:** phone-to-phone scan, printed-paper scan, low-end phone benchmark,
zxing-wasm on iOS Safari, WebAuthn PRF check.
