import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

import QRCode from 'qrcode';
import { beforeAll, describe, expect, it } from 'vitest';

import type { CardPayload } from '../src/core/crypto/cardPayload.js';
import { decodePayload, encodePayload } from '../src/core/crypto/codec.js';
import { normalizeShareCode } from '../src/core/crypto/shareCode.js';
import { configureQrDecoderWasm, decodeQrImage } from '../src/core/qr/decode.js';

/**
 * The real loop, end to end, through actual QR pixels.
 *
 * This is the test that answers the Phase 0 question. Everything in codec.test.ts
 * proves the bytes are handled correctly; this proves they survive the round trip
 * a QR code actually imposes -- byte-mode encoding, error correction, module
 * quantisation and an independent decoder implementation reading it back.
 *
 * It renders real pixels and hands them to zxing-wasm, the same decoder the app
 * uses in the browser, rather than trusting our own encoder to agree with itself.
 */

const require = createRequire(import.meta.url);
const FAST = { memKiB: 8 * 1024, time: 1, parallelism: 1 };

beforeAll(async () => {
  // In the browser this is fetched from our own origin. Under Node, Emscripten
  // has no way to fetch a filesystem path, so hand it the bytes directly.
  const bytes = await readFile(require.resolve('zxing-wasm/reader/zxing_reader.wasm'));
  configureQrDecoderWasm(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
});

/** Render a QR to a raw RGBA buffer, bypassing PNG entirely. */
function renderToImageData(payload: Uint8Array, scale = 6) {
  const symbol = QRCode.create([{ data: payload, mode: 'byte' }], {
    errorCorrectionLevel: 'M',
  });

  const size = symbol.modules.size;
  const quiet = 4; // The spec-mandated quiet zone; without it decoders fail.
  const side = (size + quiet * 2) * scale;
  const data = new Uint8ClampedArray(side * side * 4).fill(255);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!symbol.modules.get(x, y)) continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const px = (x + quiet) * scale + dx;
          const py = (y + quiet) * scale + dy;
          const i = (py * side + px) * 4;
          data[i] = data[i + 1] = data[i + 2] = 0;
        }
      }
    }
  }

  return { data, width: side, height: side, colorSpace: 'srgb' as const };
}

function card(fields: CardPayload['fields']): CardPayload {
  return {
    cardId: Uint8Array.from([0xde, 0xad, 0xbe, 0xef]),
    qrVersion: 2,
    createdAt: 1_756_080_000,
    expiresAt: null,
    fields,
  };
}

describe('end-to-end: card -> QR pixels -> card', () => {
  it('survives a full round trip through a rendered QR code', async () => {
    const shareCode = 'K7F2-QM9X';
    const original = card({
      name: 'Aravind Vadayar Krishnan',
      bloodGroup: 'O+',
      allergies: ['Penicillin', 'Peanuts'],
      medicalConditions: ['Type 1 diabetes'],
      emergencyContacts: [
        { name: 'Ravi Kumar', relationship: 'Brother', phone: '+919876543210' },
      ],
      organDonor: true,
    });

    const payload = await encodePayload(original, normalizeShareCode(shareCode), {
      argon: FAST,
    });

    // Through real pixels and an independent decoder.
    const image = renderToImageData(payload);
    const scanned = await decodeQrImage(image as unknown as ImageData);

    expect(scanned).not.toBeNull();
    expect(scanned).toEqual(payload);

    // And the recipient types the code with the wrong casing and spacing, as
    // they will in practice.
    const unlocked = await decodePayload(scanned!, normalizeShareCode('k7f2 qm9x'));

    expect(unlocked.fields.name).toBe('Aravind Vadayar Krishnan');
    expect(unlocked.fields.bloodGroup).toBe('O+');
    expect(unlocked.fields.allergies).toEqual(['Penicillin', 'Peanuts']);
    expect(unlocked.fields.emergencyContacts?.[0]?.phone).toBe('+919876543210');
    expect(unlocked.fields.organDonor).toBe(true);
    expect(unlocked.cardId).toEqual(original.cardId);
  }, 60_000);

  it('scanned payload with the wrong code fails closed', async () => {
    const payload = await encodePayload(
      card({ name: 'Test Person', bloodGroup: 'A-' }),
      normalizeShareCode('K7F2-QM9X'),
      { argon: FAST },
    );

    const scanned = await decodeQrImage(renderToImageData(payload) as unknown as ImageData);
    expect(scanned).toEqual(payload);

    await expect(decodePayload(scanned!, normalizeShareCode('WRONGCODE'))).rejects.toMatchObject({
      code: 'UNLOCK_FAILED',
    });
  }, 60_000);

  it('reads a heavier card at a larger QR version', async () => {
    const payload = await encodePayload(
      card({
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
        insurance: 'Star Health P/191234/01/2026/004521',
        notes: 'Carries an insulin pen in left jacket pocket.',
      }),
      normalizeShareCode('K7F2-QM9X'),
      { argon: FAST },
    );

    const scanned = await decodeQrImage(renderToImageData(payload) as unknown as ImageData);
    expect(scanned).toEqual(payload);

    const unlocked = await decodePayload(scanned!, normalizeShareCode('K7F2-QM9X'));
    expect(unlocked.fields.medications).toHaveLength(2);
    expect(unlocked.fields.notes).toContain('insulin pen');
  }, 60_000);
});
