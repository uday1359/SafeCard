import { describe, expect, it } from 'vitest';

import type { Argon2Params } from '../src/core/crypto/argon2.js';
import type { CardPayload } from '../src/core/crypto/cardPayload.js';
import {
  ARGON_MEM_MAX_KIB,
  HEADER_LEN,
  MAX_PAYLOAD_BYTES,
  OFF,
  OVERHEAD_LEN,
} from '../src/core/crypto/constants.js';
import {
  decodePayload,
  encodePayload,
  fromBase64Url,
  PayloadTooLargeError,
  toBase64Url,
} from '../src/core/crypto/codec.js';
import { DecodeError } from '../src/core/crypto/errors.js';
import {
  formatShareCode,
  generateShareCode,
  normalizeShareCode,
} from '../src/core/crypto/shareCode.js';

/**
 * Cheap-but-legal KDF cost for tests. Still above the 8 MiB gate-5 floor, so it
 * exercises the real validation path rather than bypassing it.
 */
const FAST: Argon2Params = { memKiB: 8 * 1024, time: 1, parallelism: 1 };

/**
 * A realistic card, not a minimal one. The size budget is only meaningful if the
 * fixture reflects what a real person actually shares: full name, blood group,
 * two allergies, two conditions, two medications and two contacts.
 */
function realisticCard(): CardPayload {
  return {
    cardId: Uint8Array.from([0xde, 0xad, 0xbe, 0xef]),
    qrVersion: 3,
    createdAt: 1_756_080_000,
    expiresAt: null,
    fields: {
      name: 'Aravind Vadayar Krishnan',
      dateOfBirth: '1991-04-17',
      bloodGroup: 'O+',
      allergies: ['Penicillin', 'Peanuts'],
      medicalConditions: ['Type 1 diabetes', 'Asthma'],
      medications: ['Insulin glargine 20u nightly', 'Salbutamol inhaler'],
      emergencyContacts: [
        { name: 'Ravi Kumar', relationship: 'Brother', phone: '+919876543210' },
        { name: 'Meera Nair', relationship: 'Mother', phone: '+919812345678' },
      ],
      preferredHospital: 'Apollo Hospital, Chennai',
      organDonor: true,
    },
  };
}

const SECRET = normalizeShareCode('K7F2-QM9X');

describe('share code', () => {
  it('generates 8 characters from the Crockford alphabet', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateShareCode();
      expect(code).toHaveLength(8);
      expect(code).toMatch(/^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{8}$/);
    }
  });

  it('generates distinct codes', () => {
    const seen = new Set(Array.from({ length: 200 }, () => generateShareCode()));
    expect(seen.size).toBeGreaterThan(190);
  });

  it('formats for display without changing the derived bytes', () => {
    expect(formatShareCode('K7F2QM9X')).toBe('K7F2-QM9X');
  });

  /**
   * The single most likely interop bug in the format: if the two devices
   * normalise differently the keys differ, and the user sees "wrong password"
   * with no way to work out why.
   */
  it('normalises casing, spacing and Crockford lookalikes identically', () => {
    const canonical = normalizeShareCode('K7F2-QM9X');
    for (const variant of ['k7f2qm9x', ' K7F2 QM9X ', 'K7F2-qm9x', 'k7f2-qm9x\n']) {
      expect(normalizeShareCode(variant)).toEqual(canonical);
    }
  });

  it('maps I, L and O to their digit lookalikes', () => {
    expect(normalizeShareCode('IL0O')).toEqual(normalizeShareCode('1100'));
  });
});

describe('codec round trip', () => {
  it('encrypts and decrypts a card unchanged', async () => {
    const card = realisticCard();
    const payload = await encodePayload(card, SECRET, { argon: FAST });
    const decoded = await decodePayload(payload, SECRET);

    expect(decoded.qrVersion).toBe(card.qrVersion);
    expect(decoded.cardId).toEqual(card.cardId);
    expect(decoded.fields.name).toBe(card.fields.name);
    expect(decoded.fields.bloodGroup).toBe('O+');
    expect(decoded.fields.allergies).toEqual(['Penicillin', 'Peanuts']);
    expect(decoded.fields.emergencyContacts).toHaveLength(2);
    expect(decoded.fields.emergencyContacts?.[0]?.phone).toBe('+919876543210');
    expect(decoded.fields.organDonor).toBe(true);
  });

  it('omits absent fields entirely', async () => {
    const minimal: CardPayload = {
      cardId: Uint8Array.from([1, 2, 3, 4]),
      qrVersion: 1,
      createdAt: 1_700_000_000,
      expiresAt: null,
      fields: { name: 'A', bloodGroup: 'O+' },
    };
    const payload = await encodePayload(minimal, SECRET, { argon: FAST });
    const decoded = await decodePayload(payload, SECRET);

    expect(decoded.fields.allergies).toBeUndefined();
    expect(decoded.fields.notes).toBeUndefined();
    expect(decoded.expiresAt).toBeNull();
  });

  it('produces different bytes each time (fresh salt and nonce)', async () => {
    const card = realisticCard();
    const a = await encodePayload(card, SECRET, { argon: FAST });
    const b = await encodePayload(card, SECRET, { argon: FAST });
    expect(a).not.toEqual(b);
  });
});

/**
 * The budget test. This is deliberately a build-failing assertion: adding a field
 * to the shared set without checking its cost should break CI, not surface later
 * as a QR that will not scan.
 */
describe('size budget', () => {
  it('keeps a realistic card under the QR budget', async () => {
    const payload = await encodePayload(realisticCard(), SECRET, { argon: FAST });
    // Surfaced so the headroom is visible in test output, not just pass/fail.
    console.info(
      `realistic card payload: ${payload.length} bytes ` +
        `(${MAX_PAYLOAD_BYTES - payload.length} bytes headroom, ${OVERHEAD_LEN} bytes overhead)`,
    );
    expect(payload.length).toBeLessThanOrEqual(MAX_PAYLOAD_BYTES);
  });

  it('refuses to emit an oversized payload', async () => {
    const bloated = realisticCard();
    // Must be incompressible. A repeated character deflates to almost nothing --
    // 4000 'x's actually fit inside the budget, which is a useful reminder that
    // the limit binds on entropy, not on character count.
    bloated.fields.notes = Array.from(crypto.getRandomValues(new Uint8Array(1500)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    await expect(encodePayload(bloated, SECRET, { argon: FAST })).rejects.toThrow(
      PayloadTooLargeError,
    );
  });

  it('does not alias the decode buffer in returned data', async () => {
    // Regression guard: cardId used to be a view into the inflated plaintext,
    // which the codec wipes on the way out -- so it arrived back as zeroes.
    const payload = await encodePayload(realisticCard(), SECRET, { argon: FAST });
    const decoded = await decodePayload(payload, SECRET);
    expect(decoded.cardId).toEqual(Uint8Array.from([0xde, 0xad, 0xbe, 0xef]));
    expect(decoded.cardId.some((b) => b !== 0)).toBe(true);
  });
});

describe('validation gates', () => {
  it('gate 1: rejects a truncated payload', async () => {
    const short = new Uint8Array(OVERHEAD_LEN - 1);
    await expect(decodePayload(short, SECRET)).rejects.toMatchObject({ code: 'CORRUPT' });
  });

  it('gate 2: rejects a QR that is not ours', async () => {
    const foreign = new Uint8Array(80);
    foreign.set([0x68, 0x74], 0); // "ht", as in an https:// URL
    await expect(decodePayload(foreign, SECRET)).rejects.toMatchObject({
      code: 'NOT_SAFECARD',
    });
  });

  it('gate 3: asks the user to update on a newer format version', async () => {
    const payload = await encodePayload(realisticCard(), SECRET, { argon: FAST });
    payload[OFF.fmtVersion] = 99;
    await expect(decodePayload(payload, SECRET)).rejects.toMatchObject({
      code: 'UNSUPPORTED_VERSION',
    });
  });

  it('gate 4: asks the user to update on an unknown cipher suite', async () => {
    const payload = await encodePayload(realisticCard(), SECRET, { argon: FAST });
    payload[OFF.suiteId] = 42;
    await expect(decodePayload(payload, SECRET)).rejects.toMatchObject({
      code: 'UNSUPPORTED_VERSION',
    });
  });

  /**
   * The denial-of-service guard. A hostile QR declaring 4 GiB of Argon2 memory
   * would hang or kill the scanning device, and it costs nothing to print. The
   * rejection must happen before any allocation -- the timing assertion is what
   * actually proves that, since a real 4 GiB attempt could not return in 100ms.
   */
  it('gate 5: rejects hostile KDF memory before allocating', async () => {
    const payload = await encodePayload(realisticCard(), SECRET, { argon: FAST });
    new DataView(payload.buffer).setUint32(OFF.argonMemKiB, 4 * 1024 * 1024, false); // 4 GiB

    const started = performance.now();
    await expect(decodePayload(payload, SECRET)).rejects.toMatchObject({
      code: 'UNSAFE_PARAMS',
    });
    expect(performance.now() - started).toBeLessThan(100);
  });

  it('gate 5: rejects a downgraded KDF cost from a hostile generator', async () => {
    const payload = await encodePayload(realisticCard(), SECRET, { argon: FAST });
    new DataView(payload.buffer).setUint32(OFF.argonMemKiB, 64, false); // 64 KiB
    await expect(decodePayload(payload, SECRET)).rejects.toMatchObject({
      code: 'UNSAFE_PARAMS',
    });
  });

  it('gate 5: accepts the documented ceiling exactly', async () => {
    const payload = await encodePayload(realisticCard(), SECRET, { argon: FAST });
    new DataView(payload.buffer).setUint32(OFF.argonMemKiB, ARGON_MEM_MAX_KIB, false);
    // Authentication must fail (the header is AAD), NOT parameter validation.
    await expect(decodePayload(payload, SECRET)).rejects.toMatchObject({
      code: 'UNLOCK_FAILED',
    });
  }, 30_000);
});

/**
 * Tamper tests. Every one must fail closed, and all must be indistinguishable
 * from a wrong password per spec section 18.
 */
describe('tamper resistance', () => {
  it('rejects a flipped byte in the ciphertext', async () => {
    const payload = await encodePayload(realisticCard(), SECRET, { argon: FAST });
    payload[HEADER_LEN + 2] = payload[HEADER_LEN + 2]! ^ 0xff;
    await expect(decodePayload(payload, SECRET)).rejects.toMatchObject({
      code: 'UNLOCK_FAILED',
    });
  });

  it('rejects a flipped byte in the authentication tag', async () => {
    const payload = await encodePayload(realisticCard(), SECRET, { argon: FAST });
    payload[payload.length - 1] = payload[payload.length - 1]! ^ 0xff;
    await expect(decodePayload(payload, SECRET)).rejects.toMatchObject({
      code: 'UNLOCK_FAILED',
    });
  });

  /**
   * The one that proves the AAD binding works. The header is cleartext and must
   * stay that way, so the only thing stopping an attacker rewriting it is that it
   * is authenticated. Flip a salt byte -- inside the header, outside the
   * ciphertext -- and authentication must still fail.
   */
  it('rejects a flipped byte in the cleartext header (AAD binding)', async () => {
    const payload = await encodePayload(realisticCard(), SECRET, { argon: FAST });
    payload[OFF.salt + 3] = payload[OFF.salt + 3]! ^ 0xff;
    await expect(decodePayload(payload, SECRET)).rejects.toMatchObject({
      code: 'UNLOCK_FAILED',
    });
  });

  it('rejects the wrong share code with the same message as tampering', async () => {
    const payload = await encodePayload(realisticCard(), SECRET, { argon: FAST });
    const wrong = normalizeShareCode('AAAA-BBBB');

    const err = await decodePayload(payload, wrong).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DecodeError);
    expect((err as DecodeError).code).toBe('UNLOCK_FAILED');
    expect((err as DecodeError).userMessage).toBe(
      'Unable to unlock this card. Please check the QR share password.',
    );
  });

  it('never leaks which part was wrong', async () => {
    const payload = await encodePayload(realisticCard(), SECRET, { argon: FAST });
    const tampered = payload.slice();
    tampered[HEADER_LEN + 1] = tampered[HEADER_LEN + 1]! ^ 0x01;

    const wrongPw = await decodePayload(payload, normalizeShareCode('ZZZZ-ZZZZ')).catch(
      (e: DecodeError) => e.userMessage,
    );
    const altered = await decodePayload(tampered, SECRET).catch(
      (e: DecodeError) => e.userMessage,
    );
    expect(wrongPw).toBe(altered);
  });
});

describe('base64url text channel', () => {
  it('round trips the identical bytes', async () => {
    const payload = await encodePayload(realisticCard(), SECRET, { argon: FAST });
    expect(fromBase64Url(toBase64Url(payload))).toEqual(payload);
  });

  it('is URL-safe and unpadded', async () => {
    const payload = await encodePayload(realisticCard(), SECRET, { argon: FAST });
    expect(toBase64Url(payload)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('tolerates surrounding whitespace from a paste', async () => {
    const payload = await encodePayload(realisticCard(), SECRET, { argon: FAST });
    const text = toBase64Url(payload);
    expect(fromBase64Url(`  ${text}\n`)).toEqual(payload);
  });
});
