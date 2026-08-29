import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import type { Argon2Params } from '../src/core/crypto/argon2.js';
import type { CardPayload } from '../src/core/crypto/cardPayload.js';
import { decodePayload, encodePayload } from '../src/core/crypto/codec.js';
import { FMT_VERSION, NONCE_LEN, SALT_LEN, SUITE_ID } from '../src/core/crypto/constants.js';
import { encodeHeader } from '../src/core/crypto/header.js';
import { normalizeShareCode } from '../src/core/crypto/shareCode.js';

/**
 * Regressions for defects found in review, plus the documented invariants that
 * had no test behind them.
 *
 * Everything here runs in the Node environment: it is either pure byte handling
 * or a file on disk. The DOM-bound halves of the same defects live in `test/ui/`.
 */

const FAST: Argon2Params = { memKiB: 8 * 1024, time: 1, parallelism: 1 };
const SECRET = normalizeShareCode('K7F2-QM9X');

function card(overrides: Partial<CardPayload> = {}): CardPayload {
  return {
    cardId: Uint8Array.from([0xde, 0xad, 0xbe, 0xef]),
    qrVersion: 1,
    createdAt: 1_756_080_000,
    expiresAt: null,
    fields: { name: 'Aravind Vadayar Krishnan', bloodGroup: 'O+' },
    ...overrides,
  };
}

/**
 * Printing is the other way the two channels get collapsed into one artefact.
 *
 * A printed sheet leaves the owner's hands as a single object, so everything on
 * it travels together. The print stylesheet hid the buttons and the form but not
 * the share code beside the QR, which handed whoever found the paper both halves
 * at once -- the same failure as naming the PNG after the code.
 *
 * Asserting on the stylesheet text is deliberately crude, and that is the point:
 * it tests the security property (these selectors are hidden when printing)
 * without knowing anything about layout, so ordinary CSS changes cannot break it
 * and deleting the rule cannot pass it.
 */
describe('the print stylesheet', () => {
  async function printBlock(): Promise<string> {
    const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
    const start = css.indexOf('@media print');
    expect(start).toBeGreaterThan(-1);

    const block = css.slice(start);
    const end = block.indexOf('display: none !important');
    expect(end).toBeGreaterThan(-1);
    return block.slice(0, end);
  }

  it('hides the share code, so a printed QR is not self-unlocking', async () => {
    expect(await printBlock()).toContain('.sharecode');
  });

  it('hides a decrypted card, so printing never leaks the recipient view', async () => {
    expect(await printBlock()).toContain('.ecard');
  });

  it('still hides the controls it always did', async () => {
    const rule = await printBlock();

    for (const selector of ['.topbar', '.form', '.dropzone', '.btn', '.meter']) {
      expect(rule).toContain(selector);
    }
  });
});

/**
 * The ownership rule from codec.ts, argon2.ts and CLAUDE.md: a function wipes
 * only what it allocated, and `secret` always belongs to the caller. It is
 * stated in three places and was asserted in none -- yet the owner panel needs
 * the secret to survive `encodePayload` in order to show the code to the user,
 * so a well-meaning `wipe(secret)` inside the codec would break the app in a way
 * that looks like a display bug.
 */
describe('secret ownership', () => {
  it('leaves the caller their secret after encoding', async () => {
    const secret = normalizeShareCode('K7F2-QM9X');
    const before = Uint8Array.from(secret);

    await encodePayload(card(), secret, { argon: FAST });

    expect(Array.from(secret)).toEqual(Array.from(before));
    expect(secret.some((b) => b !== 0)).toBe(true);
  });

  it('leaves the caller their secret after decoding', async () => {
    const secret = normalizeShareCode('K7F2-QM9X');
    const payload = await encodePayload(card(), secret, { argon: FAST });
    const before = Uint8Array.from(secret);

    await decodePayload(payload, secret);

    expect(Array.from(secret)).toEqual(Array.from(before));
  });
});

/**
 * `encodeHeader` throws a plain Error rather than a DecodeError, because a
 * wrong-length salt is our own bug and never something a scanned QR can cause.
 * Worth pinning: the header is fixed-width, and a silently truncated salt would
 * produce payloads that encode fine and never decode anywhere else.
 */
describe('header field widths', () => {
  const base = {
    fmtVersion: FMT_VERSION,
    suiteId: SUITE_ID,
    argonMemKiB: FAST.memKiB,
    argonTime: FAST.time,
    argonPar: FAST.parallelism,
    salt: new Uint8Array(SALT_LEN),
    nonce: new Uint8Array(NONCE_LEN),
  };

  it('refuses a short salt', () => {
    expect(() => encodeHeader({ ...base, salt: new Uint8Array(SALT_LEN - 1) })).toThrow(
      /salt must be 16 bytes/,
    );
  });

  it('refuses a long nonce', () => {
    expect(() => encodeHeader({ ...base, nonce: new Uint8Array(NONCE_LEN + 1) })).toThrow(
      /nonce must be 12 bytes/,
    );
  });
});

/**
 * Expiry survives the wire format but is not enforced anywhere.
 *
 * `expiresAt` is encoded, decoded and then ignored: nothing compares it to the
 * clock, and the owner panel hardcodes `null`, so section 19 is not implemented.
 * These tests pin the transport half that *does* work, so that whoever builds
 * the feature inherits a proven round trip -- and so the gap is recorded as a
 * deliberate omission rather than looking like an oversight in the codec.
 *
 * The reader currently shows an expired card as though it were current. That is
 * the outstanding work, not a property asserted here.
 */
describe('expiry round trip', () => {
  it('carries an expiry timestamp through the codec unchanged', async () => {
    const expiresAt = 1_800_000_000;

    const payload = await encodePayload(card({ expiresAt }), SECRET, { argon: FAST });
    const decoded = await decodePayload(payload, SECRET);

    expect(decoded.expiresAt).toBe(expiresAt);
  });

  it('omits the field entirely when a card never expires', async () => {
    const withExpiry = await encodePayload(card({ expiresAt: 1_800_000_000 }), SECRET, {
      argon: FAST,
      deterministic: { salt: new Uint8Array(SALT_LEN), nonce: new Uint8Array(NONCE_LEN) },
    });
    const without = await encodePayload(card({ expiresAt: null }), SECRET, {
      argon: FAST,
      deterministic: { salt: new Uint8Array(SALT_LEN), nonce: new Uint8Array(NONCE_LEN) },
    });

    // Absent keys are the whole size strategy (section 30): a null expiry must
    // cost nothing rather than encoding as an explicit null.
    expect(without.length).toBeLessThan(withExpiry.length);
    expect((await decodePayload(without, SECRET)).expiresAt).toBeNull();
  });
});

/**
 * The downloaded QR must not be named after the secret that opens it.
 *
 * The filename used to be `safecard-${result.shareCode}.png`. A filename is not
 * a channel the owner controls: it shows up in the Downloads listing, in OS
 * search indexes, in any cloud sync of that folder, and it travels with the file
 * into every message the PNG is attached to. Naming the image after the code
 * makes one artefact that unlocks itself -- exactly what keeping the QR and the
 * code on separate channels (section 4) exists to prevent.
 *
 * This guards the call site rather than the helper. A test that only exercises
 * `qrDownloadName()` cannot see the regression it exists to prevent: the old
 * code called no helper at all, it built the name inline from the live share
 * code. Comparing the helper's output against separately generated codes looks
 * rigorous and proves nothing, because two random 40-bit codes never collide.
 *
 * Reading the assignment is crude on purpose, and is the same tactic as the
 * print-stylesheet test above: it knows nothing about how the component is
 * written, only that the one line naming the file cannot reach the secret.
 */
describe('the downloaded QR filename', () => {
  it('is not built from the share code', async () => {
    const source = await readFile(new URL('../src/ui/OwnerPanel.tsx', import.meta.url), 'utf8');
    expect(source).toContain('a.download');

    const assignments = [...source.matchAll(/\.download\s*=\s*(.+);/g)].map((m) => m[1]!.trim());

    expect(assignments).toEqual(['qrDownloadName()']);
    expect(assignments[0]).not.toMatch(/shareCode/);
  });
});
