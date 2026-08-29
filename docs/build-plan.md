# SafeCard — Web Application Build Plan

## Context

`SafeCard_Complete_Application_Requirements.md` is a 59-section specification for a privacy-first,
offline emergency information card app. The spec assumes a native application (§5 recommends
Flutter) and treats a web version as a distant v3 item (§36, "Web emergency viewer").

**The delivery target is now a web application.** This is not a UI-layer swap — it changes the
security model, the storage guarantees, and the threat model. This plan reworks the stack and phases
accordingly, and is explicit about the two places where the web platform is *weaker* than native and
the several places where it is meaningfully *stronger*.

### Decisions taken

| Decision | Choice |
|---|---|
| Delivery | **Installable PWA only** — no Flutter, no app stores |
| Stack | **TypeScript + React + Vite**, static SPA |
| Hosting | **Static, no backend** — preserves §37 and the §41 privacy claim |
| Durability | **Forced encrypted backup download** after the first card is saved |
| App lock | **WebAuthn passkey (PRF)**, with PIN/passphrase fallback |

### What the web platform changes

**Two things get worse:**

1. **Code delivery is no longer a fixed artifact.** A store-signed binary is reviewed once and
   cannot change under the user. A web app re-delivers its JavaScript on every load, so whoever
   controls the host can push code that exfiltrates a card. This is the single most important
   honesty issue in the whole project — see §5 of the threat model below.
2. **Storage is evictable.** Browsers reclaim IndexedDB under pressure. For an emergency card,
   silent data loss is a product-killing failure. Hence the forced backup.

**Several things get better:**

1. **The Windows scanning problem disappears entirely.** The native plan needed a separate
   drag-drop/`zxing2` path because `mobile_scanner` has no Windows support and `camera_windows` has
   no frame streaming. In a browser, `getUserMedia` is one API on every platform.
2. **Non-extractable `CryptoKey` is better than anything native offered.** Derive an AES key with
   `extractable: false` and the raw key bytes never enter the JS heap at all — the browser holds
   them inside its own crypto implementation. The Dart plan could only *try* to wipe key bytes; here
   they are never exposed.
3. **WebAuthn PRF is a better app lock than a PIN.** Face ID, Touch ID, Windows Hello and Android
   biometrics all derive a key from the passkey directly. No PIN to store, verify, or leak.
4. **Zero install friction for the recipient.** §17 assumed the scanner had the app. A recipient
   in an emergency now just opens a URL.

---

## Part 1 — Technology Stack

### 1.1 Application shell

| Concern | Choice | Why |
|---|---|---|
| Build | **Vite + TypeScript** | Static SPA output. Deliberately *not* Next.js — a server framework invites a backend, and §37 says don't. |
| UI | **React 19** | Chosen over Flutter Web for accessibility: §24 and §49 make screen readers, large text, keyboard nav and high contrast hard requirements, and semantic HTML beats a canvas-rendered UI decisively here. Also a fraction of the bundle size, which matters when someone opens this on bad signal in an emergency. |
| Routing | **React Router** (data router) | Static routes, no server. |
| State | **Zustand** | The app is a handful of cards and a lock state; a query cache would be ceremony. |
| Styling | **Tailwind CSS v4** + CSS custom properties | Theme tokens as CSS variables give light / dark / high-contrast without a rebuild (§24). |
| Accessible primitives | **Radix UI** | Dialogs, checkboxes and the field-selection list need correct focus management and ARIA. Hand-rolling these is where accessibility promises quietly break. |
| Forms + validation | **React Hook Form** + **Zod** | Zod schemas are reused to validate *decoded QR payloads* — the same types guard the UI and the wire format. |
| PWA / offline | **vite-plugin-pwa** (Workbox) | Precache the whole app shell. §21 makes offline the headline requirement. |

> Svelte would cut roughly 40% off the bundle if you would rather optimise for load weight than
> ecosystem maturity. React is recommended mainly for Radix and the tested a11y primitives.

### 1.2 Cryptography

| Concern | Choice | Note |
|---|---|---|
| AEAD | **AES-256-GCM via Web Crypto** (`crypto.subtle`) | Native, hardware-accelerated, already audited. No library. |
| KDF | **Argon2id via `@openpgpjs/argon2id`** (WASM) | Web Crypto has no Argon2id. This build is SIMD-optimised with an automatic non-SIMD fallback for Safari, and is maintained by the OpenPGP.js team. |
| Randomness | `crypto.getRandomValues` | Salt, nonce, DEK, share code. |
| Key handling | **Non-extractable `CryptoKey`** wherever the key is only used for encrypt/decrypt | Key bytes never reach JS. See Part 2. |

**Argon2id parameters:** `m = 32 MiB, t = 3, p = 1`.

Measured at **136 ms** on a desktop baseline (Node 24), against a 1.5 s budget — see the results
table in the README. That is a far better result than expected and reverses the earlier concern:
there is now room to consider *raising* the cost (64 MiB measured at 265 ms) rather than lowering
it. Two caveats before doing so. A low-end phone browser will be several times slower, and the
binding constraint on mobile is the tab memory ceiling rather than time — iOS Safari kills
memory-hungry tabs, and that failure mode does not appear in a desktop benchmark at all. Hold at
32 MiB until the phone numbers exist.

### 1.3 Storage

| Concern | Choice |
|---|---|
| Database | **IndexedDB via `idb`** — small, typed, promise-based |
| At-rest encryption | **AES-GCM per record**, DEK held as a non-extractable `CryptoKey` |
| Durability | `navigator.storage.persist()` + PWA install prompt + **forced encrypted backup** |
| Photos | Encrypted `Blob` in IndexedDB, resized on import |

**Not SQLite WASM + OPFS.** It is the right answer for a real database workload, but it requires a
Web Worker and `createSyncAccessHandle` and buys nothing for a dataset of a few cards with no
queries. IndexedDB is the proportionate choice.

**Encryption at rest is mandatory here, not optional.** On native, the OS sandbox stopped another
app reading the database file. In a browser, anyone with the unlocked device can open DevTools and
read IndexedDB directly. Field-level encryption is what makes the app lock mean anything at all.

### 1.4 QR

| Concern | Choice |
|---|---|
| Generation | **`qrcode`** — byte-mode input from a `Uint8Array`, renders to canvas for PNG export and print |
| Scanning — primary | **`BarcodeDetector`** where available (Chromium, Android) |
| Scanning — fallback | **`zxing-wasm`** — **mandatory**, not optional |
| Camera | `getUserMedia({ video: { facingMode: 'environment' } })` |
| Desktop / no camera | Drag-drop or paste an image, decoded through the same `zxing-wasm` path |

**Safari and every browser on iOS lack `BarcodeDetector`.** Since a large share of emergency
*recipients* will be on an iPhone, the WASM fallback is on the critical path — treat it as the
primary implementation and `BarcodeDetector` as the optimisation.

### 1.5 Platform integration

| Concern | Choice | Note |
|---|---|---|
| App lock | **WebAuthn PRF** (`navigator.credentials`) | Android/GPM, Safari 18+/iCloud Keychain, Windows Hello since the Feb 2026 update. |
| Lock fallback | PIN/passphrase → Argon2id → key-wrapping key | For browsers or devices without PRF. Required, not optional. |
| Call / message (§22) | `tel:` and `sms:` links | Work natively on mobile browsers. |
| Share (§16) | **Web Share API** with a download fallback | |
| Print (§16) | `window.print()` + a print stylesheet | Simpler than the native `pdf` dependency. |
| Install | `beforeinstallprompt` + iOS "Add to Home Screen" guidance | Install materially improves storage durability. |
| i18n (§53) | **`@formatjs`** or Lingui, wired in Phase 1 | Retrofitting is painful. |

### 1.6 Testing

**Vitest** (unit) · **Playwright** (E2E, real browsers, offline simulation) · **axe-core** via
`@axe-core/playwright` (automated accessibility gates) · **@testing-library/react**.

Playwright matters more here than the native equivalent did: it can drive real Chromium, Firefox and
WebKit, simulate offline, and catch the Safari-specific failures that are otherwise found by users.

---

## Part 2 — Memory Management

Still a first-class concern, with a different shape than the native plan.

### 2.1 Secure memory

**The rule carries over exactly: secrets live in `Uint8Array`, never in a `String`.**

JavaScript strings are immutable and interned — you cannot overwrite one, and you have even less
control over GC than in Dart. Typed arrays, by contrast, are mutable and can be genuinely zeroed.

- **Zero with `arr.fill(0)`** in a `finally` block the moment a secret is no longer needed.
- **Derive keys as non-extractable.** `crypto.subtle.deriveKey(..., extractable: false, ...)`
  returns a `CryptoKey` whose bytes never exist in JS memory. Use `deriveKey`, not `deriveBits`
  followed by `importKey`, wherever the key is only used to encrypt or decrypt. This is strictly
  better than what the native plan could achieve.
- **The unavoidable leak is the same.** An `<input>` yields a `String`. Convert to bytes on the
  first line, clear the input's value immediately, and keep the window short. Document it.
- **WASM linear memory needs explicit attention.** Argon2id runs in WASM, so the password bytes and
  the multi-megabyte working buffer live in a `WebAssembly.Memory` that JS cannot reach into after
  the fact. Zero the input and output views after each derivation, and instantiate a fresh module
  per derivation so the buffer becomes collectable.
- **Never log a secret, never put one in an `Error` message**, and never let one reach an error
  reporter. There is no crash reporter in v1 — keep it that way.

### 2.2 Web Workers replace isolates

Argon2id at 32 MiB takes 1–2 seconds. On the main thread that freezes the UI completely and can trip
the browser's slow-script warning.

- **Run the KDF in a dedicated Web Worker.** Post the password bytes as a **transferable**
  `ArrayBuffer` so they are moved rather than copied — then zero the buffer on the worker side after
  use. Note that a transfer *detaches* the sender's view, which conveniently removes one copy.
- Show determinate progress. A two-second unresponsive unlock in an emergency reads as broken.

### 2.3 RAM budgeting

- **32 MiB of WASM memory is a real allocation in a tab with a tighter budget than a native app.**
  On iOS especially, the tab may simply be killed. Benchmark on a real low-end phone browser in
  Phase 0 and accept lower parameters if needed.
- **`bfcache` keeps a backgrounded tab fully alive in memory, secrets included.** Wipe derived
  material and lock the app on `pagehide` and on `visibilitychange → hidden`. This is the web
  analogue of the native "lock on background" rule, and it is easy to forget.
- **Photos:** resize on import via `createImageBitmap(blob, { resizeWidth: 512 })`, draw to a
  canvas, export with `canvas.toBlob(..., 'image/webp', 0.8)`. Never hold the full-resolution bitmap.
  Always `URL.revokeObjectURL` — leaked object URLs pin the entire blob in memory.
- **Never cache decrypted data in the service worker.** Workbox precaches the app shell only; card
  data must never touch the Cache API.

### 2.4 What the web cannot do

State these plainly rather than discovering them in review:

- **No screenshot blocking.** There is no `FLAG_SECURE` equivalent. The card can always be captured.
- **No control over swap or memory dumps.** The tab shares a process model with the browser.
- **No secure enclave for arbitrary data.** WebAuthn PRF is the only hardware-backed primitive
  available, and it protects the key-wrapping key, not the data.

---

## Part 3 — The Interoperability Contract

Unchanged in substance — see [`qr-payload-format.md`](qr-payload-format.md). The wire format was
deliberately specified in language-agnostic bytes, so the pivot from Dart to TypeScript costs
nothing. Two web-specific additions:

### 3.1 Do not put the payload in a URL

The obvious web temptation is to share a card as a link. Resist it in v1.

A URL **query string** is sent to the server and lands in access logs, referrer headers and proxy
logs — disqualifying. A URL **fragment** (`#...`) is not sent to the server, which makes it
superficially acceptable, but it persists in browser history, in synced history across the user's
devices, and in anything that scrapes the clipboard.

The **Base64url text form** from §6 of the format doc remains the non-camera share channel, but it
travels as message *text* the recipient pastes into the app — not as a clickable link. Revisit only
with a deliberate decision recorded.

### 3.2 Argon2 parameters may differ from the native target

The format carries `argonMemKiB`, `argonTime` and `argonPar` in the header precisely so this can be
tuned per-deployment without a format break. If the Phase 0 browser benchmark forces lower values
than 32 MiB / t=3, the format is unaffected — but the honest security wording in §41 must reflect
the parameters actually shipped.

---

## Part 4 — Phases

### Phase 0 — De-risk the core *(do this first)*

The gate is unchanged in intent, but **most of it can now run in Node today** — Web Crypto and the
Argon2 WASM build both work outside a browser, so the codec, size budget and tamper tests need no
device at all.

- [ ] Scaffold Vite + React + TS; confirm dev server and production build.
- [ ] Implement the codec: fields → CBOR → zlib → Argon2id → AES-256-GCM → header → bytes.
- [ ] Implement the reverse with all seven validation gates.
- [ ] **Measure payload size** for a realistic card against the 600-byte budget.
- [ ] Tamper tests fail closed: flipped byte in ciphertext, in tag, in **header** (proves AAD).
- [ ] Out-of-range `argonMemKiB` is rejected before allocation (the DoS guard).
- [ ] Commit test vectors.

Then the parts that need real devices:

- [ ] Render a real QR; **scan phone-to-phone off a screen**, and off **printed paper**.
- [ ] **Benchmark Argon2id in a low-end phone browser.** Tune to keep unlock under ~1.5 s and
      confirm the tab is not killed. Set final parameters.
- [ ] Confirm `zxing-wasm` decodes on **iOS Safari** (no `BarcodeDetector` there).
- [ ] Confirm WebAuthn PRF returns a value on at least one Android and one Apple device.

**Gate: do not start Phase 1 until a QR generated in one browser decrypts in another on a different
OS, and the Argon2 parameters are settled.**

### Phase 1 — Shell, design system, accessibility baseline

- [ ] App shell, routing, responsive layout (bottom nav on mobile, sidebar on desktop, §45).
- [ ] Theme tokens as CSS variables: light, dark, high contrast; respect
      `prefers-reduced-motion` and `prefers-contrast` (§24).
- [ ] Radix-based primitives: dialog, checkbox list, PIN entry, danger button.
- [ ] i18n scaffolding with one locale.
- [ ] **Wire `axe-core` into CI now.** Accessibility as a gate from day one is cheap; as a Phase 6
      cleanup it is expensive and usually gets cut.
- [ ] Static screens with mock data (§50 Phase 1).

### Phase 2 — Storage and durability

- [x] IndexedDB schema via `idb`; `meta`, `records` and `settings` stores. Contacts live inside the
      card record rather than in their own store — they are edited as part of the card, never
      independently, and a separate store would buy nothing but a join.
- [x] Generate the DEK; wrap it with the lock key; store only the wrapped form.
- [x] Per-record AES-GCM encryption in the repository layer, invisible to callers. The record AAD
      binds each blob to its store and key, so a record cannot be moved between slots.
- [ ] Card + contact CRUD behind the create-card wizard (§13). The card persists and autosaves, but
      the wizard itself is not built — the harness form is still the only editor.
- [ ] Photo import with resize and encrypted blob storage.
- [x] `navigator.storage.persist()` request — asked after the vault exists, not before, and a
      refusal is surfaced in the footer rather than swallowed.
- [ ] PWA install prompt.
- [ ] **Encrypted backup export and import.** Promoted from the native plan's Phase 6 — on the web,
      storage is evictable, so backup is a v1 durability requirement rather than a convenience.
- [ ] **Forced backup download** after the first card is saved.

### Phase 3 — Application lock (Layer 1, §4)

- [ ] WebAuthn passkey registration with the `prf` extension; derive the key-wrapping key.
- [x] Passphrase → Argon2id → wrapping key. This is the fallback path, built first because Phase 2
      storage needs *some* lock key to wrap the DEK with; PRF slots in above it without changing
      anything downstream of `LockSecret`.
- [ ] Feature-detect PRF and prefer it where available.
- [x] Lock on `pagehide` and `visibilitychange → hidden`; wipe derived material (see 2.3). Locking
      drops the decrypted card and the generated share code too, not just the key — a backgrounded
      tab keeps everything resident, so dropping the key alone would protect nothing.
- [ ] Idle auto-lock.
- [x] **Keep the app lock and the share code as structurally distinct types** — §4 forbids reusing
      one as the other. Enforced with branded TypeScript types: `LockSecret` and `ShareCodeSecret`.

### Phase 4 — QR generation (Layer 2)

- [ ] Field-selection screen with the explicit **shared / not shared** summary (§38 Principle 4).
- [ ] Generate the share code (Crockford Base32, 8 chars, 40 bits), with a strength-checked
      custom-passphrase override.
- [ ] Promote the Phase 0 codec into the app, with the Worker-based KDF.
- [ ] Render, download PNG, Web Share, print.
- [ ] Persist the `QRShare` record — shared fields, version, timestamps. **Never the share code.**

### Phase 5 — QR scanning and unlock

- [ ] Camera scan via `getUserMedia`, with the permission UX from §40.
- [ ] `zxing-wasm` decode as the primary path; `BarcodeDetector` where available.
- [ ] Drag-drop / paste-image decode — same code path, and this is what replaces the native plan's
      whole separate Windows workstream.
- [ ] The seven validation gates mapped to their distinct §40 messages; wrong password and tampering
      share one message (§18).
- [ ] Rate limit with escalating delay, **never a permanent lock** (§18 — a responder may need it).
- [ ] Shared-card display with `tel:` / `sms:` actions.

### Phase 6 — Emergency features and honesty

- [ ] Emergency Mode: high contrast, minimal taps (§23).
- [ ] QR versioning and the stale-QR warning (§20).
- [ ] Expiration as an honestly-labelled display rule (§19).
- [ ] Card deletion with confirmation (§38 Principle 3).
- [ ] **Privacy and disclaimer text written against what the code actually does** (§41, §42), and
      explicitly covering the web-specific caveats: no screenshot protection, code served from a
      host, storage can be evicted.

### Phase 7 — Hardening and release

- [x] **Strict CSP** — `default-src 'self'`, no inline script, no external origins. Injected into
      the built `index.html` by the `safecard-csp` plugin in `vite.config.ts` (build only; the dev
      server needs looser rules and must not dictate the shipped policy). `'wasm-unsafe-eval'`,
      `img-src data:` and `style-src 'unsafe-inline'` are required by Argon2/zxing, the QR data URL
      and React's inline styles respectively — removing any of the three breaks the app. Trusted
      Types not yet applied. **Enforcement is NOT VALIDATED in a real browser.**
- [ ] Subresource Integrity; audit and minimise the dependency tree.
- [ ] Playwright matrix: Chromium, Firefox, WebKit; offline simulation of every core flow (§21).
- [ ] Real-device pass: low-end Android, iPhone/Safari, desktop.
- [ ] Lighthouse PWA and accessibility audits; `axe` clean.
- [ ] Static hosting with immutable asset hashes; publish build hashes.

**Deferred to v2** (per §35, §54): multiple cards, templates, cloud sync, multilingual UI. §25 grants
that one card is enough for MVP.

---

## Part 5 — Threat Model Additions

§43 covers scenarios A–E and they still apply. The web platform adds three.

### Scenario F — The host serves malicious code

**The defining web risk.** Whoever controls the origin can push JavaScript that reads the decrypted
card and exfiltrates it, on any page load, to any user, without review.

Mitigations, none of which fully close it:
- **Static hosting with no backend.** Nothing to compromise server-side beyond the files.
- **Strict CSP with no external origins.** Exfiltration needs somewhere to send data; deny it.
- **Subresource Integrity** on every asset.
- **PWA install + service worker**, so a returning user runs the build already cached on device
  rather than fetching fresh code. This is the strongest available mitigation and is another reason
  the install prompt matters.
- **Publish build hashes** so a third party can verify what is served.

**This must be stated in the privacy text.** §42 forbids claiming more security than the
implementation provides, and §57.10 makes it a product principle. A web app cannot honestly claim
the same assurance as a reviewed, signed native binary, and pretending otherwise is precisely the
failure mode those sections exist to prevent.

### Scenario G — The browser evicts stored data

The user's card silently disappears. Mitigated by `navigator.storage.persist()`, the install prompt,
and the forced encrypted backup — the reason backup moved into Phase 2.

### Scenario H — XSS is total compromise

One injected script defeats every other control. Mitigated by strict CSP, Trusted Types, no
`dangerouslySetInnerHTML`, Zod-validated decode output, and a deliberately small dependency tree.
Every added dependency is a supply-chain entry into this scenario.

---

## Part 6 — Verification

**Phase 0 gate:** a QR generated in one browser decrypts in another on a different OS; payload under
600 bytes; Argon2id under ~1.5 s on a low-end phone browser without the tab being killed.

**Unit (Vitest)**
- Codec round-trip; tamper tests on ciphertext, tag and header; all fail closed.
- Gate 5 parameter clamp rejects a hostile `argonMemKiB` before allocating.
- Share-code normalization: `k7f 2qm9` and `K7F2-QM9X` derive identical bytes.
- Payload size regression test that **fails the build** above budget.
- Cross-version: v1 payload against a v2 reader and vice versa; unknown CBOR keys ignored.

**Security**
- Grep for `string` in crypto signatures — should be zero.
- Create a card, then inspect IndexedDB in DevTools: **no plaintext PII**.
- Confirm no secret reaches `console` in a production build.
- CSP has no external origins. `style-src 'unsafe-inline'` remains, and is the one gap left:
  closing it needs React's inline styles moved to classes first.

**E2E (Playwright)**
- Owner journey (§52) and recipient journey, both **offline**.
- Lock-on-background wipes state; reload requires unlock.
- Eviction simulation: clear storage, restore from the backup file.
- WebKit specifically — the `zxing-wasm` fallback path.

**Accessibility**
- `axe` clean in CI on every screen.
- Keyboard-only pass; screen-reader pass over Emergency Mode; 200% zoom; high-contrast mode.

**Manual**
- Print a QR and scan the paper copy; scan in poor light; phone screen to phone screen.
- Install as a PWA on Android and iOS; confirm offline launch and data survival.

---

## Sources

- [Passkeys & WebAuthn PRF for end-to-end encryption (2026)](https://www.corbado.com/blog/passkeys-prf-webauthn) · [Yubico developer guide to PRF](https://developers.yubico.com/WebAuthn/Concepts/PRF_Extension/Developers_Guide_to_PRF.html) · [SimpleWebAuthn PRF docs](https://simplewebauthn.dev/docs/advanced/prf)
- [openpgpjs/argon2id (WASM, RFC 9106)](https://github.com/openpgpjs/argon2id)
- [MDN — Barcode Detection API](https://developer.mozilla.org/en-US/docs/Web/API/Barcode_Detection_API) · [caniuse: BarcodeDetector](https://caniuse.com/mdn-api_barcodedetector) · [Barcode scanning on iOS: the missing web API](https://dev.to/ilhannegis/barcode-scanning-on-ios-the-missing-web-api-and-a-webassembly-solution-2in2)
- [RxDB — localStorage vs IndexedDB vs OPFS vs WASM-SQLite](https://rxdb.info/articles/localstorage-indexeddb-cookies-opfs-sqlite-wasm.html) · [web.dev — Offline data](https://web.dev/learn/pwa/offline-data) · [OPFS overview](https://webspecification.com/blog/origin-private-file-system/)
