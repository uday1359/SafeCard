# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # copy WASM assets, then Vite dev server on :5173
npm run build        # copy WASM, typecheck, production build
npm test             # full suite (phase0-report self-skips)
npm run typecheck
npm run test:phase0  # opt-in Argon2 benchmark + QR sizing report

npx vitest run test/codec.test.ts              # one file
npx vitest run -t "gate 5"                     # one test by name
npx vitest                                     # watch mode
```

`npm run dev` and `npm run build` both run `tool/copy-wasm.mjs` first. Running `vite` directly
skips it, and the app then fails at runtime with a missing-WASM fetch.

## Documents

`SafeCard_Complete_Application_Requirements.md` is the product spec (59 sections) and the source of
truth for *what* to build. Code comments cite it as "section N" — keep that convention; the section
numbers are how design decisions stay traceable.

`docs/qr-payload-format.md` is **normative** for the wire format. It is a contract between two
independent installations, possibly on different OSes and app versions. Read it before touching
anything under `src/core/crypto/`, and change it only with a `fmtVersion` bump.

`docs/build-plan.md` holds the stack rationale, memory-management rules, threat model and phases.

## Architecture

A local-first, offline PWA. Static hosting, no backend. React + Vite + TypeScript.

**The wire format is the center of gravity.** Everything else is arranged around getting an
encrypted card into ~600 bytes of QR:

```
SharedFields → CBOR (integer keys) → zlib → AES-256-GCM(AAD = header) → [header|ciphertext|tag]
```

`src/core/crypto/` implements this and is **dual-target**: it runs in the browser and in Node
(tests). Both Web Crypto and `CompressionStream` are used as platform primitives — no bundled zlib,
no crypto library beyond the Argon2 WASM.

Layering, roughly outermost-in:

- `src/ui/` — React components. `graphics.tsx` holds all artwork as inline SVG.
- `src/core/model/draft.ts` — the editable UI shape (`DraftCard`, all strings) and its one-way
  projection onto the wire shape (`toSharedFields`). Keep these separate; conflating them puts
  half-typed input into the codec.
- `src/core/qr/` — QR render (`qrcode`) and decode (`zxing-wasm`).
- `src/core/crypto/` — the codec, header, share code, Argon2, wipe helpers.

### Two security layers stay structurally distinct

Spec section 4 forbids the application PIN from doubling as the QR share code. `ShareCodeSecret` is
a branded type in `shareCode.ts` for exactly this reason. When the app lock lands (Phase 3), give it
its own brand rather than reusing this one.

### Seven validation gates

`decodeHeader()` runs gates 1–5 **before any key derivation**; `decodePayload()` runs 6 (GCM tag)
and 7 (inflate + CBOR). Two things about this are load-bearing:

- **Gate 5 is a security control.** KDF parameters live in the cleartext header and are
  attacker-controlled until the tag verifies — which cannot happen until *after* the KDF has run. A
  hostile QR declaring 4 GiB of Argon2 memory would hang or kill the scanner. Reject out-of-range
  parameters before allocating. There is a lower bound too, against a hostile *generator*.
- **Gates 6 and 7 must not leak which failed.** A wrong share code and a tampered payload produce
  one identical message (section 18). `DecodeError` carries developer detail in `.message` and the
  user-safe text in `.userMessage`; UI code must only ever render `.userMessage`.

### Memory discipline, and the hazard it creates

Secrets live in `Uint8Array`, never in a `string` — JS strings are immutable and cannot be wiped.
Buffers are zeroed with `wipe()` in `finally`. Keys are derived as **non-extractable `CryptoKey`**
so the raw bytes never enter the JS heap.

The non-obvious consequence, which has already caused two bugs: **nothing returned may alias a
buffer that gets wiped.**

- `decodeCard()` must `.slice()` `cardId` — CBOR byte strings decode to views over the input buffer,
  which the codec wipes on the way out. It previously returned four zero bytes.
- `cbor-x`'s `encode()` returns a view into a *reusable internal* buffer. Copy it, or the next
  `encode()` overwrites the previous card's plaintext.

Text fields are safe because they decode into fresh JS strings.

### `Bytes` is an ambient global

`src/types.d.ts` declares `type Bytes = Uint8Array<ArrayBuffer>` globally — do not import it. It
exists because TypeScript 5.7 made typed arrays generic, and Web Crypto / WebAssembly require
`ArrayBuffer` specifically rather than `SharedArrayBuffer`.

### WASM loading

Both Argon2 (`argon2id`) and the QR reader (`zxing-wasm`) default to fetching their `.wasm` from a
CDN. Both are instead copied to `public/wasm/` and served first-party — the CSP forbids external
origins, and service-worker precaching (needed for offline unlock) only covers same-origin assets.

`loadArgon2id()` builds a **fresh instance per derivation**, deliberately. The library clears its
WASM memory between runs but never deallocates it, so a cached instance keeps tens of megabytes of
former key-derivation state resident.

`wasmLoader.ts` assembles its `node:` import specifiers at runtime (`'node:' + 'fs/promises'`) so
the bundler cannot statically see them and stub dead Node shims into the browser build.

## Invariants worth protecting

- **The size budget test fails the build on purpose.** Adding a shared field without checking its
  cost should break CI, not surface later as a QR that will not scan.
- **`estimatePayloadSize()` must stay exactly equal to the real encoded length.** The live capacity
  meter depends on it; drift means the meter shows green until generation fails. There is a test
  asserting exact equality.
- **Share-code normalization must be identical on both devices.** `k7f2 qm9x` and `K7F2-QM9X` derive
  the same key. A mismatch surfaces as an indistinguishable "wrong password".
- **No photo in the QR** (section 30) — the byte budget makes this arithmetic.
- **Do not put the payload in a URL.** Query strings reach server logs; fragments persist in browser
  history and sync. The Base64url form travels as message text the recipient pastes.
- **Never claim more security than the code provides** (sections 42, 57.10). Two web-specific
  admissions belong in any privacy copy: the page's JS is served by a host and can change, and
  screenshots cannot be blocked.

## Dependency pins

`@vitejs/plugin-react` is held at v5 because Vitest pins Vite 7 while plugin-react v6 requires
Vite 8. Resolve future conflicts by pinning rather than `--legacy-peer-deps`.

Every added dependency widens the XSS/supply-chain surface in Scenario H of the threat model. Prefer
a platform primitive where one exists.

## Status

Phases 0 and 1 (partial). The codec, wire format, validation gates and a working owner/recipient
harness exist. **Not built:** application lock, IndexedDB storage, encrypted backup, live camera
scanning, service worker, Web Worker for the KDF (Argon2 currently runs on the main thread at
~136 ms). Nothing is persisted — reloading clears the draft.

Four Phase 0 gate items still need real hardware: phone-to-phone and printed scans, a low-end phone
browser benchmark, `zxing-wasm` on iOS Safari, and a WebAuthn PRF check. See README.md.
