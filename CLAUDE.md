# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # a fresh clone has no node_modules; nothing below works until this runs
npm run dev          # copy WASM assets, then Vite dev server on :5173
npm run build        # copy WASM, typecheck, production build into dist/
npm run preview      # serve the built dist/ on :4173 — checks the real bundle, not the dev server
npm test             # full suite (phase0-report self-skips)
npm run typecheck
npm run test:phase0  # opt-in Argon2 benchmark + QR sizing report

npx vitest run test/codec.test.ts              # one file
npx vitest run test/ui/                        # the DOM tests only
npx vitest run -t "gate 5"                     # one test by name
npx vitest                                     # watch mode
```

Baseline to compare against: **102 passed, 3 skipped**; bundle **339 kB raw / 111 kB gzipped**;
realistic-card payload **296 B** against the 600-byte budget.

Five platform gotchas, all of which look like bugs and are not:

- **Never run bare `vite`.** `npm run dev` and `npm run build` run `tool/copy-wasm.mjs` first, which
  populates the gitignored `public/wasm/`. Bare `vite` starts happily and then fails at runtime
  fetching WASM that was never copied.
- **`npm run test:phase0` fails on Windows.** The script uses the POSIX env-var prefix form, which
  cmd and PowerShell do not parse. Run `$env:PHASE0_BENCH=1; npx vitest run test/phase0-report.test.ts`.
- **A UI test that dies inside Argon2 is a realm problem, not a crypto problem.** Tests default to
  the `node` environment; files under `test/ui/` opt into a DOM with a `// @vitest-environment jsdom`
  docblock on line 1 (Vitest 4 removed `environmentMatchGlobs`). jsdom runs the page in its own
  realm, so `new Uint8Array(...)` is jsdom's while its `TextEncoder` is Node's re-exported — and the
  two fail `instanceof` against each other. That surfaces as
  `concatArrays: Data must be in the form of a Uint8Array` thrown from deep inside `argon2id`, with
  nothing to suggest the environment is at fault. `test/setup.ts` repairs it; read that file before
  concluding the KDF is broken.
- **Port 5173 is `strictPort: true`.** The dev server exits rather than silently moving to another
  port, so the URL in the docs is always the right one.
- **The watcher ignores `.claude/`** (`vite.config.ts`). On Windows a file another process is still
  writing is locked, `fs.watch` throws `EBUSY`, and that FSWatcher error kills the dev server — it
  prints its URL, then dies seconds later. Nothing under `.claude/` is part of the app, so it is
  excluded rather than retried. If the server ever dies right after starting, read the log for
  `EBUSY` before assuming the app is at fault.

## Repo tooling

`.claude/` carries three slash commands and a subagent that encode the checks this project cares
about — prefer them over ad-hoc runs:

- `/verify` — typecheck, test, build in order, stopping at the first failure.
- `/gates` — runs the validation-gate tests and reports gate by gate what is actually proven.
- `/budget` — re-measures payload size and Argon2 cost against the recorded Phase 0 baseline.
- `crypto-reviewer` subagent — review anything touching `src/core/crypto/` before accepting it.

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

- `src/ui/` — React components. `graphics.tsx` holds all artwork as inline SVG (the CSP forbids
  external image hosts). `App.tsx` is explicitly a harness: owner and recipient panels side by side
  on one page so the loop can be exercised on a single machine. It also owns the vault state machine
  (`useVault.ts`) and the lock screen, which are real rather than harness scaffolding.
- `src/core/model/draft.ts` — the editable UI shape (`DraftCard`, all strings, list fields held as
  raw comma-separated text) and its one-way projection onto the wire shape (`toSharedFields`). Keep
  these separate; conflating them puts half-typed input into the codec.
- `src/core/qr/` — QR render (`qrcode`, byte mode, ECC M) and decode (`zxing-wasm`).
- `src/core/store/` — encryption at rest and IndexedDB. See below.
- `src/core/crypto/` — the codec, header, share code, lock secret, Argon2, wipe helpers.

`zxing-wasm` is the **primary** decoder, not a fallback: no browser on iOS has `BarcodeDetector`,
and a large share of emergency recipients are on an iPhone. `decodeQrImage()` returns raw bytes,
never text — the payload is binary and a round trip through a JS string would corrupt it.

### Two security layers stay structurally distinct

Spec section 4 forbids the application PIN from doubling as the QR share code, so each is its own
branded type and the compiler refuses to pass one where the other belongs. `ShareCodeSecret`
(`shareCode.ts`) stays confined to the QR path; `LockSecret` (`lockSecret.ts`) is what the vault
consumes. Phase 3 changes where the lock bytes come from — WebAuthn PRF rather than a typed
passphrase — without touching anything downstream of that type.

`shareCode.ts` has **two** normalization functions that both produce `ShareCodeSecret`, and they are
deliberately different: `normalizeShareCode()` strips separators, uppercases and applies the
Crockford input mapping (`I`/`L`→`1`, `O`→`0`); `normalizePassphrase()` only trims, because an
owner-supplied passphrase is case-sensitive and may legitimately contain spaces. Do not unify them.

### Encryption at rest mirrors the QR codec

`src/core/store/` deliberately reuses the codec's shape rather than inventing a second scheme:

```
passphrase --Argon2id--> KEK --wraps--> DEK --AES-256-GCM--> every record
```

- **Only `vault.ts` knows about keys.** `db.ts` stores opaque blobs; `cardRepository.ts` takes and
  returns a `DraftCard`. A caller that *can* skip encryption eventually will, so nothing above the
  repository is given the option.
- **The envelope is what makes a passphrase change cheap.** `rewrapVault()` re-encrypts 32 bytes;
  no card, photo or setting is rewritten.
- **Gate 5 is reused verbatim** on stored KDF parameters. That looks paranoid for local data and is
  not: once backup import lands, a `VaultMeta` arrives from a file someone was sent, which is
  exactly as attacker-controlled as a QR header.
- **Both AADs bind context.** The vault AAD covers the KDF parameters, so downgrading `memKiB` in
  IndexedDB fails to authenticate instead of weakening the next unlock. The record AAD covers the
  store name and key, so a blob copied to another slot will not decrypt.
- **A fresh nonce per write.** The card slot is overwritten on every edit; reusing a nonce under one
  key is the catastrophic failure for GCM, so this has a test of its own.
- **`VaultError` mirrors `DecodeError`** — a wrong passphrase and a tampered vault produce one
  identical `userMessage`, for the same reason section 18 requires it of the QR path.

Locking drops the plaintext, not just the key: `App.tsx` clears the draft and the generated share
code whenever the vault leaves `unlocked`. A backgrounded tab stays fully resident in memory
(build-plan 2.3), so a lock that keeps the decrypted card around protects nothing.

Autosave is gated on a `hydrated` flag. Unlocking sets the DEK, which wakes the autosave effect
while the draft is still the sample card — without the gate, a slow read from IndexedDB loses the
race and the sample overwrites the user's real card.

### Seven validation gates

`decodeHeader()` runs gates 1–5 **before any key derivation**; `decodePayload()` runs 6 (GCM tag)
and 7 (inflate + CBOR). Two things about this are load-bearing:

- **Gate 5 is a security control.** KDF parameters live in the cleartext header and are
  attacker-controlled until the tag verifies — which cannot happen until *after* the KDF has run. A
  hostile QR declaring 4 GiB of Argon2 memory would hang or kill the scanner. Reject out-of-range
  parameters before allocating. There is a lower bound too, against a hostile *generator*.
- **Gates 6 and 7 must not leak which failed.** A wrong share code and a tampered payload produce
  one identical message (section 18). `DecodeError` carries developer detail in `.message` and the
  user-safe text in `.userMessage`; UI code must only ever render `.userMessage`. The code-to-message
  map in `errors.ts` is one-to-one and must not be broadened.

### Memory discipline, and the hazards it creates

Secrets live in `Uint8Array`, never in a `string` — JS strings are immutable and cannot be wiped.
Buffers are zeroed with `wipe()` in `finally`. Keys are derived as **non-extractable `CryptoKey`**
so the raw bytes never enter the JS heap.

**Ownership rule:** a function wipes only what it allocated. `encodePayload()`, `decodePayload()`
and `deriveKeyBytes()` all leave `secret` alone — the caller owns it, because the same secret is
usually still needed to display the code to the user. Callers must wipe it themselves.

The non-obvious consequence, which has already caused two bugs: **nothing returned may alias a
buffer that gets wiped**, and conversely **nothing kept may alias a buffer someone else frees**.

- `decodeCard()` must `.slice()` `cardId` — CBOR byte strings decode to views over the input buffer,
  which the codec wipes on the way out. It previously returned four zero bytes.
- `cbor-x`'s `encode()` returns a view into a *reusable internal* buffer. Copy it, or the next
  `encode()` overwrites the previous card's plaintext.
- `deriveKeyBytes()` copies the Argon2 result before wiping it: the library's return value may be a
  view over WASM linear memory, unreachable once the instance is dropped. That copy is the only
  moment those bytes can be cleared.

Text fields are safe because they decode into fresh JS strings.

### `Bytes` is an ambient global

`src/types.d.ts` declares `type Bytes = Uint8Array<ArrayBuffer>` globally — do not import it. It
exists because TypeScript 5.7 made typed arrays generic, and Web Crypto / WebAssembly require
`ArrayBuffer` specifically rather than `SharedArrayBuffer`.

Two other TS conventions: relative imports carry a `.js` extension (`verbatimModuleSyntax` plus
bundler resolution), and `noUncheckedIndexedAccess` is on — the `!` after indexed reads is required,
not sloppiness.

### WASM loading

Both Argon2 (`argon2id`) and the QR reader (`zxing-wasm`) default to fetching their `.wasm` from a
CDN. Both are instead copied to `public/wasm/` and served first-party — the CSP forbids external
origins, and service-worker precaching (needed for offline unlock) only covers same-origin assets.

`loadArgon2id()` builds a **fresh instance per derivation**, deliberately. The library clears its
WASM memory between runs but never deallocates it, so a cached instance keeps tens of megabytes of
former key-derivation state resident.

`wasmLoader.ts` assembles its `node:` import specifiers at runtime (concatenating the `node:` prefix)
so the bundler cannot statically see them and stub dead Node shims into the browser build. For the
same dual-target reason `configureQrDecoderWasm()` accepts raw bytes: Emscripten's `locateFile` result
can only be fetched, which works same-origin in a browser but not from a path under Node.

## Invariants worth protecting

- **The size budget test fails the build on purpose.** Adding a shared field without checking its
  cost should break CI, not surface later as a QR that will not scan.
- **`estimatePayloadSize()` must stay exactly equal to the real encoded length.** It can skip the
  KDF only because AES-GCM is length-preserving, so ciphertext length equals compressed length. The
  live capacity meter depends on this; drift means the meter shows green until generation fails.
  There is a test asserting exact equality.
- **Share-code normalization must be identical on both devices.** `k7f2 qm9x` and `K7F2-QM9X` derive
  the same key. A mismatch surfaces as an indistinguishable "wrong password".
- **`test/vectors/` is committed on purpose** — fixed, published, throwaway values that guard
  cross-version interop (format doc section 8). `phase0-sample.png` unlocks with `K7F2-QM9X`. The
  `deterministic` option on `encodePayload()` exists to regenerate them and is for tests only.
- **No photo in the QR** (section 30) — the byte budget makes this arithmetic.
- **Do not put the payload in a URL.** Query strings reach server logs; fragments persist in browser
  history and sync. The Base64url form (`toBase64Url`) travels as message text the recipient pastes.
- **The CSP is real code, not a comment.** It is built by the `safecard-csp` plugin in
  `vite.config.ts` and injected into the built `index.html`; the plugin throws rather than shipping
  a page without it. It applies to `npm run build`/`preview` only — `npm run dev` has no policy, so
  a CSP violation cannot be reproduced against the dev server. Three directives are load-bearing
  and look removable: `'wasm-unsafe-eval'` (Argon2 and zxing will not instantiate without it),
  `img-src data:` (the generated QR is a data URL) and `style-src 'unsafe-inline'` (React inline
  styles). The bundle still contains zxing-wasm's jsDelivr fallback URL; `connect-src 'self'` is
  what stops it being reachable if the local WASM configuration is ever missed.
- **Every function deriving a key from stored `VaultMeta` calls `assertVaultMetaSafe()` first.**
  Gate 5 for storage. It is one function because it was previously inline in `unlockVault` and
  omitted from `unwrapDekBytes`, so re-wrapping under an explicitly supplied cost reached Argon2
  with unvalidated stored parameters.
- **`VAULT_ARGON_DEFAULTS` must never be collapsed into `ARGON_DEFAULTS`.** The QR cost is bounded
  by the worst phone that might ever scan a code and is expected to come *down* after the Phase 0
  benchmark; the vault cost is paid once, on the owner's own device. Sharing the constant would let
  a scanner-driven downgrade silently weaken encryption at rest. A test asserts vault > QR.
- **A failure to open IndexedDB must never fall through to `setup`.** `useVault` has an
  `unavailable` status for exactly this. The create path overwrites the vault meta, so treating
  "cannot tell" as "nothing here" hands the user a button that destroys their cards. `create()`
  writes through `createVaultMetaIfAbsent()`, which uses IndexedDB `add()` so the check and the
  write share one transaction -- a `hasVault()` test followed by a `put()` leaves a gap a second
  tab fits through.
- **Never claim more security than the code provides** (sections 42, 57.10). Two web-specific
  admissions belong in any privacy copy: the page's JS is served by a host and can change, and
  screenshots cannot be blocked.

## Dependencies

`@types/node` is deliberately held at v24 to match the Node 24 runtime. Bumping it to v26 would
typecheck the build against APIs the installed runtime does not have. Track the runtime, not latest.

The old `@vitejs/plugin-react` v5 pin is **resolved and gone** — it existed because Vitest 3 pinned
Vite 7 while plugin-react v6 needs Vite 8. Vitest 4 accepts Vite 6/7/8, so the toolchain now runs
Vite 8 / Vitest 4 / plugin-react 6 with no peer conflict. `vite` is also now a direct devDependency:
the npm scripts invoke its binary, and relying on transitive hoisting for a tool you call by name is
a break waiting to happen. Resolve any future conflict by pinning rather than `--legacy-peer-deps`.

`jsdom` and `@testing-library/react` are devDependencies and ship nothing. They exist because
everything above `src/core/` had no test at all, and the untested part included `useVault` --
whose "a storage failure must land on `unavailable`, never on `setup`" rule is the difference
between a dead end and a create button that destroys the user's cards. That invariant was defended
by a comment. It is now defended by a test.

`idb` is the one storage dependency, and it earns its place: raw IndexedDB transactions auto-commit
when the microtask queue drains, so an `await` mid-transaction silently aborts it — a data-loss bug
that only appears under load. It is a promise wrapper with no transitive dependencies.

Every added dependency widens the XSS/supply-chain surface in Scenario H of the threat model. Prefer
a platform primitive where one exists.

## Status

Phases 0, 1 (partial) and 2 (partial). The codec, wire format, validation gates, encryption at rest
and a working owner/recipient harness exist. The card is encrypted with AES-256-GCM under a
passphrase-wrapped DEK and **survives a reload**.

**Not built:** WebAuthn PRF unlock and idle auto-lock (Phase 3), encrypted backup export/import,
photo storage, contact CRUD behind the create-card wizard, live camera scanning, service worker, and
the Web Worker for the KDF — Argon2 still runs on the main thread, which now blocks the unlock
screen rather than just QR generation, so it matters more than it did.

Four Phase 0 gate items still need real hardware: phone-to-phone and printed scans, a low-end phone
browser benchmark, `zxing-wasm` on iOS Safari, and a WebAuthn PRF check. See README.md.
