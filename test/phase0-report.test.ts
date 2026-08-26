import QRCode from 'qrcode';
import { describe, expect, it } from 'vitest';

import { deriveKeyBytes } from '../src/core/crypto/argon2.js';
import type { CardPayload } from '../src/core/crypto/cardPayload.js';
import { encodePayload } from '../src/core/crypto/codec.js';
import { ARGON_DEFAULTS, MAX_PAYLOAD_BYTES } from '../src/core/crypto/constants.js';
import { randomBytes } from '../src/core/crypto/secureBytes.js';
import { normalizeShareCode } from '../src/core/crypto/shareCode.js';

/**
 * Phase 0 evidence, not a correctness suite.
 *
 * Opt-in because it runs Argon2id at production cost several times over:
 *
 *     PHASE0_BENCH=1 npx vitest run
 *
 * These numbers are a DESKTOP baseline. The gate in the build plan is a low-end
 * phone browser, which will be several times slower and runs under a much tighter
 * memory ceiling. Treat a desktop pass as necessary, never sufficient.
 */

const enabled = process.env.PHASE0_BENCH === '1';
const SECRET = normalizeShareCode('K7F2-QM9X');

function card(overrides: Partial<CardPayload['fields']> = {}): CardPayload {
  return {
    cardId: Uint8Array.from([0xde, 0xad, 0xbe, 0xef]),
    qrVersion: 1,
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
      ...overrides,
    },
  };
}

describe.skipIf(!enabled)('Phase 0 report', () => {
  it('measures Argon2id cost at candidate parameters', async () => {
    const salt = randomBytes(16);
    const candidates = [
      { memKiB: 8 * 1024, time: 1, parallelism: 1 },
      { memKiB: 19 * 1024, time: 2, parallelism: 1 }, // OWASP floor
      { memKiB: 32 * 1024, time: 3, parallelism: 1 }, // current target
      { memKiB: 64 * 1024, time: 3, parallelism: 1 },
    ];

    const rows: string[] = [];
    for (const p of candidates) {
      const started = performance.now();
      await deriveKeyBytes(SECRET, salt, p);
      const ms = performance.now() - started;
      const target = p.memKiB === ARGON_DEFAULTS.memKiB && p.time === ARGON_DEFAULTS.time;
      rows.push(
        `  m=${String(p.memKiB / 1024).padStart(3)} MiB  t=${p.time}  p=${p.parallelism}` +
          `  ->  ${ms.toFixed(0).padStart(5)} ms${target ? '   <- current target' : ''}`,
      );
    }

    console.info(`\nArgon2id cost (desktop baseline, Node ${process.version}):\n${rows.join('\n')}\n`);
    expect(rows).toHaveLength(candidates.length);
  }, 120_000);

  it('reports QR version and module count for real payloads', async () => {
    const cases: { label: string; payload: Uint8Array }[] = [
      {
        label: 'minimal (name + blood group + 1 contact)',
        payload: await encodePayload(
          {
            cardId: Uint8Array.from([1, 2, 3, 4]),
            qrVersion: 1,
            createdAt: 1_756_080_000,
            expiresAt: null,
            fields: {
              name: 'Aravind Krishnan',
              bloodGroup: 'O+',
              emergencyContacts: [
                { name: 'Ravi Kumar', relationship: 'Brother', phone: '+919876543210' },
              ],
            },
          },
          SECRET,
          { argon: { memKiB: 8 * 1024, time: 1, parallelism: 1 } },
        ),
      },
      {
        label: 'realistic (full medical + 2 contacts)',
        payload: await encodePayload(card(), SECRET, {
          argon: { memKiB: 8 * 1024, time: 1, parallelism: 1 },
        }),
      },
      {
        label: 'heavy (adds notes + insurance)',
        payload: await encodePayload(
          card({
            notes: 'Carries an insulin pen in left jacket pocket. Hypoglycaemia risk after exercise.',
            insurance: 'Star Health, policy P/191234/01/2026/004521',
          }),
          SECRET,
          { argon: { memKiB: 8 * 1024, time: 1, parallelism: 1 } },
        ),
      },
    ];

    const rows: string[] = [];
    for (const c of cases) {
      // Byte mode, ECC level M -- exactly what the format specifies.
      const qr = QRCode.create([{ data: c.payload, mode: 'byte' }], {
        errorCorrectionLevel: 'M',
      });
      const modules = qr.version * 4 + 17;
      rows.push(
        `  ${c.label.padEnd(42)} ${String(c.payload.length).padStart(4)} B  ` +
          `-> QR v${String(qr.version).padStart(2)} (${modules}x${modules} modules)`,
      );
      expect(c.payload.length).toBeLessThanOrEqual(MAX_PAYLOAD_BYTES);
    }

    console.info(`\nQR sizing (byte mode, ECC M, budget ${MAX_PAYLOAD_BYTES} B):\n${rows.join('\n')}\n`);
  }, 60_000);

  it('renders a scannable QR to disk for the manual phone-to-phone test', async () => {
    const payload = await encodePayload(card(), SECRET, {
      argon: { memKiB: 8 * 1024, time: 1, parallelism: 1 },
    });

    const { mkdir } = await import('node:fs/promises');
    await mkdir('test/vectors', { recursive: true });

    await QRCode.toFile(
      'test/vectors/phase0-sample.png',
      [{ data: payload, mode: 'byte' }],
      { errorCorrectionLevel: 'M', margin: 2, width: 512 },
    );

    console.info(
      '\nWrote test/vectors/phase0-sample.png' +
        '\n  Share code: K7F2-QM9X' +
        '\n  Scan it from a phone to close the manual half of the Phase 0 gate.\n',
    );
  }, 60_000);
});
