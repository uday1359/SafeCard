# SafeCard QR Payload Format — v1

This document is the **wire contract** between two independent SafeCard installations, which may be
running different operating systems and different app versions. Treat it as a protocol
specification, not an implementation detail. Changes require a `fmtVersion` bump.

Related requirements: §27 (security requirements), §28 (key derivation), §29 (payload), §30 (QR
size), §20 (versioning), §40 (error handling).

---

## 1. Encoding pipeline

```
card fields (selected by owner)
   -> CBOR encode (integer keys)
   -> zlib compress
   -> AES-256-GCM encrypt (AAD = header)
   -> [ header | ciphertext | tag ]
   -> QR code, byte mode, ECC level M
```

Decoding is the exact reverse, with validation gates at each step (section 5).

---

## 2. Byte layout

All multi-byte integers are **big-endian**. Total fixed overhead: **54 bytes**.

| Offset | Size | Field | Value / notes |
|---:|---:|---|---|
| 0 | 2 | `magic` | `0x53 0x43` — ASCII `"SC"` |
| 2 | 1 | `fmtVersion` | `0x01` for this document |
| 3 | 1 | `suiteId` | `0x01` = Argon2id + AES-256-GCM, salt 16, nonce 12, tag 16 |
| 4 | 4 | `argonMemKiB` | uint32, Argon2id memory cost in KiB |
| 8 | 1 | `argonTime` | uint8, Argon2id iterations |
| 9 | 1 | `argonPar` | uint8, Argon2id parallelism |
| 10 | 16 | `salt` | CSPRNG, fresh per QR |
| 26 | 12 | `nonce` | CSPRNG, fresh per QR (never reused with a key) |
| **38** | *N* | `ciphertext` | AES-256-GCM output |
| 38+*N* | 16 | `tag` | GCM authentication tag |

**Header = bytes `[0, 38)`. The entire header is passed as AES-GCM AAD.**

The header must be cleartext — a recipient has to read the KDF parameters *before* it can derive a
key. Binding it as AAD means any tampering (notably downgrading `argonMemKiB` to make cracking
cheap) fails the tag check instead of silently succeeding.

> **Refinement vs. the approved plan:** `suiteId` was added as an explicit AEAD/KDF algorithm
> identifier. §27 requires an "algorithm identifier" in the payload metadata, and folding it into a
> single suite byte is cheaper than separate `kdfId` / `aeadId` fields.

---

## 3. Key derivation (§28)

```
key = Argon2id(
        password = normalize(shareCode) as UTF-8 bytes,
        salt     = header.salt,
        m        = header.argonMemKiB,
        t        = header.argonTime,
        p        = header.argonPar,
        hashLen  = 32 )
```

**Target parameters:** `m = 32768` KiB (32 MiB), `t = 3`, `p = 1`. Above the OWASP floor of
19 MiB / t=2. Final values are set by the Phase 0 benchmark on a low-end Android device and must
keep unlock under roughly 1.5 s.

### 3.1 Share code normalization — interop critical

The generating and scanning devices **must** derive identical password bytes. Normalize before
encoding:

1. Trim surrounding whitespace.
2. Remove all `-` and space characters.
3. Uppercase (ASCII).
4. Apply Crockford Base32 input mapping: `I`, `L` become `1`; `O` becomes `0`.
5. Encode as UTF-8.

Without steps 2–4, a user typing `k7f 2qm9` fails against a code displayed as `K7F2-QM9X`, and the
error is indistinguishable from a wrong password. This is the single most likely interop bug in the
whole format.

### 3.2 Generated share code

Alphabet: **Crockford Base32** — `0123456789ABCDEFGHJKMNPQRSTVWXYZ` (excludes `I`, `L`, `O`, `U`).
Length: **8 characters = 40 bits** of entropy, drawn from a CSPRNG.
Displayed grouped for readability: `K7F2-QM9X`.

An owner-supplied passphrase is permitted as an override but must pass a strength check. It is
normalized by steps 1 and 5 only — **not** uppercased or stripped, since a passphrase is
case-sensitive and may legitimately contain spaces. The generated-vs-custom distinction is therefore
part of the UX contract, not the wire format; both produce a byte string the KDF consumes.

---

## 4. Plaintext structure

CBOR map with **integer keys**. Absent fields are omitted entirely — this is where the size saving
comes from, and it is what makes the owner's field selection (§9, §38) directly reduce payload size.

### Top level

| Key | Type | Field |
|---:|---|---|
| 1 | bytes(4) | `cardId` — random, stable across regenerations of the same card |
| 2 | uint | `qrVersion` (§20) |
| 3 | uint | `createdAt`, epoch seconds |
| 4 | uint / null | `expiresAt`, epoch seconds (§19 — a display convention, not revocation) |
| 5 | map | `fields` |

### `fields` map

| Key | Type | Field |
|---:|---|---|
| 10 | text | name |
| 11 | text | preferredName |
| 12 | text | dateOfBirth (`YYYY-MM-DD`) |
| 13 | text | bloodGroup |
| 14 | array of text | allergies |
| 15 | array of text | medicalConditions |
| 16 | array of text | medications |
| 17 | text | notes |
| 18 | array of arrays | emergencyContacts — `[name, relationship, phone, secondaryPhone?]` |
| 19 | text | preferredHospital |
| 20 | text | insurance |
| 21 | text | language |
| 22 | bool | organDonor |
| 23 | array of text | doctor — `[name, phone]` |

**No photo.** §30 forbids it and the size budget makes it arithmetic rather than opinion.

### 4.1 Size budget

**Hard limit: 600 bytes total.** That sits around QR version 20 at ECC level M and scans reliably
off a phone screen and off paper. With 54 bytes of overhead, roughly 546 bytes remain for the
compressed CBOR — ample for name, blood group, allergies, conditions and two contacts.

Enforce with a unit test that **fails the build** when a realistic card exceeds the budget, so
nobody adds a field to the shared set without noticing the cost.

---

## 5. Decode validation gates

Gates run in order. Each maps to a distinct user-facing message from §40. Note that the first four
gates run **before** the KDF, so a junk QR is rejected instantly rather than after 32 MiB and two
seconds of Argon2id.

| # | Check | Failure message |
|---:|---|---|
| 1 | `length >= 54` | "The QR code could not be read. Please scan again." |
| 2 | `magic == "SC"` | "This does not appear to be a SafeCard QR code." |
| 3 | `fmtVersion <= MAX_SUPPORTED` | "Please update SafeCard to read this card." |
| 4 | `suiteId` is known | "Please update SafeCard to read this card." |
| 5 | **KDF parameter sanity** (below) | "This QR code could not be read safely." |
| 6 | Derive key, AES-GCM open, verify tag | "Unable to unlock this card. Please check the QR share password." |
| 7 | zlib inflate, CBOR decode | "The QR code could not be read. Please scan again." |

Gate 6 is deliberately a **single** message covering both a wrong password and a tampered payload.
§18 requires not revealing which part was wrong; GCM cannot distinguish these cases anyway.

### 5.1 Gate 5 — KDF parameter sanity is a security control, not a formality

The header is attacker-controlled until the tag is verified, and the tag cannot be verified until
after the KDF has run. A malicious QR can therefore declare `argonMemKiB = 4194304` (4 GiB) and
**OOM or hang the scanning device** — a denial-of-service that costs the attacker nothing to print
on a sticker. Clamp before allocating:

```
reject unless  argonMemKiB <= 262144   (256 MiB)
reject unless  argonMemKiB >= 8192     (8 MiB)
reject unless  argonTime   <= 10
reject unless  argonPar    <= 4
```

The lower bound matters as much as the upper one. An attacker who re-encodes a *captured* payload
cannot weaken it (the tag would fail), but a hostile *generator* could hand out QRs that are
trivially crackable while looking legitimate.

---

## 6. QR encoding

- **Byte mode**, ECC level **M**. Both endpoints are our own app, so no Base45/Base64 armour is
  needed and byte mode is denser.
- A **Base64url** text form of the identical byte string is the secondary share channel, for when a
  camera is unavailable (paste into a message). Same bytes, same validation gates.

---

## 7. Version compatibility

- A reader encountering a `fmtVersion` greater than it supports shows "Please update SafeCard to
  read this card" — never a generic error. Two people with different app versions is a routine
  situation, not an edge case.
- New optional CBOR keys **within** `fmtVersion 1` are backwards compatible: unknown integer keys
  must be **ignored, not rejected**. This allows additive field growth without a format bump.
- Removing or retyping an existing key requires a `fmtVersion` bump.

---

## 8. Test vectors

To be generated in Phase 0 and committed under `test/security/`. Each vector pins `shareCode`,
`salt`, `nonce`, Argon2 params, plaintext CBOR, and the expected final byte string.

These are the regression guard for cross-platform interop — Android, iOS and Windows must all
reproduce the same bytes from the same inputs. Required tamper vectors: a flipped byte in the
ciphertext, in the tag, and in the header (proving the AAD binding), plus an out-of-range
`argonMemKiB` (proving gate 5). All must fail closed.
