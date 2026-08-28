# SafeCard

> A privacy-first, offline emergency information card PWA that lets users securely store important
> emergency details locally and share selected information through a password-protected encrypted
> QR code.

**Status: Phase 0 complete, Phase 1 partial.** The QR codec, wire format, share-code derivation and
all seven validation gates are implemented and tested, and there is a working owner/recipient
harness you can run — see [Running the app](#running-the-app).

Not built yet: the application lock, IndexedDB storage, encrypted backup, live camera scanning, the
service worker, and the Web Worker for the KDF. **Nothing is persisted** — reloading clears the
draft.

---

## Documents

| Document | What it is |
|---|---|
| [`SafeCard_Complete_Application_Requirements.md`](SafeCard_Complete_Application_Requirements.md) | The product specification. 59 sections. The source of truth for *what* to build. |
| [`docs/build-plan.md`](docs/build-plan.md) | Stack, memory-management rules, threat model and phased tasks. The source of truth for *how*. |
| [`docs/qr-payload-format.md`](docs/qr-payload-format.md) | The QR wire contract between two installations. Changing it breaks interop — read before touching the codec. |

## Running the app

### Prerequisites

- **Node 20 or newer.** Verified on Node 24.19.0 with npm 11.17.0.
- A modern browser. Chrome, Edge, Firefox and Safari all work.

That is the whole list. There is no backend, no database, no API key and no account — the app is
static files that do all their work on your device.

### Quick start

```bash
npm install
npm run dev
```

Open **http://localhost:5173**.

### Do not run `vite` directly

`npm run dev` and `npm run build` both run `tool/copy-wasm.mjs` first, which copies the Argon2 and
zxing WASM binaries into `public/wasm/`. That directory is gitignored, so a fresh clone does not
have them. Bare `vite` skips the copy step, starts happily, and then the app fails at runtime
fetching WASM that was never put there.

The binaries are served first-party rather than from a CDN on purpose: the CSP forbids external
origins, and service-worker precaching — which offline unlock depends on — only covers same-origin
assets.

### All commands

| Command | What it does |
|---|---|
| `npm run dev` | Copies WASM, then Vite dev server on `:5173` |
| `npm run build` | Copies WASM, typechecks, production build into `dist/` |
| `npm run preview` | Serves the built `dist/` on `:4173` — use it to check the real bundle |
| `npm test` | Full suite: codec correctness, validation gates, tamper resistance |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test:phase0` | Opt-in Argon2 benchmark + QR sizing report (slower) |

Narrower test runs:

```bash
npx vitest run test/codec.test.ts    # one file
npx vitest run -t "gate 5"           # one test by name
npx vitest                           # watch mode
```

### Try the full loop

The page is the Phase 0/1 harness: both sides of the exchange sit side by side so the core loop can
be exercised end to end on one machine.

1. **Panel 1 — Your emergency card.** It opens prefilled with sample data. Edit any field; the
   capacity meter under the form shows the exact payload size in bytes as you type, against the
   600-byte budget. No key derivation runs per keystroke.
2. Click **Generate encrypted QR**. This mints a fresh share code, derives a key with Argon2id, and
   renders the QR.
3. The share code appears beside the QR with three buttons: **Copy code**, **Download PNG**, and
   **Print**. Copy the code.
4. **Panel 2 — Scan and unlock.** The Base64url payload is already autofilled from the QR you just
   generated, so on a single machine you can go straight to the next step. To exercise the real
   path instead, download the PNG and either drop it on the dropzone or paste a screenshot into the
   panel.
5. Paste the share code and click **Unlock card**. The decoded card appears.

To test a scan between two devices, `test/vectors/phase0-sample.png` is a committed QR with the
fixed share code `K7F2-QM9X`. Open it on one screen and scan it with another device pointed at the
app, or print it.

### Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Blank page; failed request for `/wasm/*.wasm` | You ran `vite` directly. Use `npm run dev` so `tool/copy-wasm.mjs` populates the gitignored `public/wasm/`. |
| `Port 5173 is already in use` and the server exits instead of moving | Deliberate — `strictPort: true` in `vite.config.ts`, so the URL never silently changes. Free the port, or edit the port there. |
| On Windows, `npm run test:phase0` fails with `'PHASE0_BENCH' is not recognized as an internal or external command` | The script uses the POSIX prefix form `PHASE0_BENCH=1 vitest run`, which cmd and PowerShell do not parse. In PowerShell run `$env:PHASE0_BENCH=1; npx vitest run test/phase0-report.test.ts` instead. |
| Unlock reports a bad code when you are sure the code is right | Formatting is not the cause: `k7f2qm9x` and `K7F2-QM9X` derive the same key. By design (§18) a wrong code and a tampered payload produce byte-identical messages, so a cropped or corrupted QR looks exactly like a wrong code. |
| Everything you typed disappears on reload | Expected. Local storage is Phase 2; nothing is persisted yet. |

---

## Phase 0 results

The gate is: *does an authenticated-encrypted payload with a memory-hard KDF fit in a QR a cheap
phone can scan, fast enough to feel instant?* The spec's own roadmap (§50) answers this last, after
all the UI is built. Answering it first is the whole point of Phase 0.

**Payload size** — byte mode, ECC level M, 600-byte budget:

| Card | Payload | QR version |
|---|---:|---|
| Minimal (name, blood group, 1 contact) | 137 B | v8 — 49×49 modules |
| **Realistic (full medical, 2 contacts)** | **296 B** | **v13 — 69×69 modules** |
| Heavy (adds notes and insurance) | 380 B | v15 — 77×77 modules |

296 bytes against a 600-byte budget is 304 bytes of headroom. CBOR with integer keys plus zlib is
doing most of that work; the fixed envelope costs 54 bytes.

**Argon2id cost** — desktop baseline, Node 24:

| Parameters | Time |
|---|---:|
| m=8 MiB, t=1 | 26 ms |
| m=19 MiB, t=2 *(OWASP floor)* | 60 ms |
| **m=32 MiB, t=3 *(current target)*** | **136 ms** |
| m=64 MiB, t=3 | 265 ms |

136 ms leaves a lot of room under the 1.5 s budget. A low-end phone browser will be several times
slower, so this is necessary but not sufficient — and if phone numbers come in well, there is room
to raise the cost rather than lower it.

### Gate status

- [x] Realistic payload under 600 bytes — **296 B**
- [x] Round trip, field omission, fresh salt/nonce per QR
- [x] Tamper tests fail closed: ciphertext, tag, and **header** (proves the AAD binding)
- [x] Hostile `argonMemKiB` rejected **before allocating** — verified by timing, not just by outcome
- [x] Downgraded KDF cost rejected
- [x] Wrong code and tampered payload give byte-identical user messages (§18)
- [x] Share-code normalization: `k7f2qm9x` and `K7F2-QM9X` derive the same key
- [ ] **Scan phone-to-phone off a screen, and off printed paper** — `test/vectors/phase0-sample.png`, share code `K7F2-QM9X`
- [ ] **Benchmark in a low-end phone browser**; confirm the tab is not killed at 32 MiB
- [ ] Confirm `zxing-wasm` decodes on **iOS Safari** (no `BarcodeDetector` there)
- [ ] Confirm WebAuthn PRF returns a value on one Android and one Apple device

The unchecked items need real devices. Everything above them runs in CI.

---

## Non-negotiable engineering rules

These exist because the spec makes promises to users (§27, §41, §42, §57) that only hold if the code
actually behaves this way.

1. **Secrets live in `Uint8Array`, never in a `string`.** JS strings are immutable and interned —
   they cannot be wiped. Typed arrays can. See `src/core/crypto/secureBytes.ts`.
2. **Derive keys as non-extractable `CryptoKey`.** The browser then holds the key material inside
   its own crypto implementation and it never enters the JS heap — better than anything the native
   plan could offer.
3. **Nothing returned may alias a buffer we wipe.** This already bit once: `cardId` was a view into
   the inflated plaintext and came back as zeroes. `cbor-x` has the same hazard on encode — it
   returns a view into a reusable internal buffer. Copy on both boundaries.
4. **Validate KDF parameters before allocating.** A hostile QR declaring 4 GiB of Argon2 memory is a
   denial-of-service on the scanning device. See `docs/qr-payload-format.md` §5.1.
5. **A wrong password and a tampered payload produce the same message** (§18). GCM cannot
   distinguish them, and neither should the UI.
6. **Run the KDF in a Web Worker, and load a fresh WASM instance each time.** The Argon2 library
   clears its memory between runs but never deallocates it.
7. **Never claim more security than the implementation provides** (§42, §57.10). Two web-specific
   admissions belong in the privacy copy: the page's code is served by a host and can change, and
   there is no way to block screenshots.
8. **No photo in the QR** (§30) — the size budget makes it arithmetic, not opinion.

---

## Scope

**Target:** one installable PWA — phone, laptop and desktop. Static hosting, no backend (§37).

**Deferred to v2** (§35, §54): multiple cards, templates, cloud sync, multilingual UI. §25 grants
that one card is enough for MVP.
