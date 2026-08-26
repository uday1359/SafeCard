import { randomBytes, utf8, wipe } from './secureBytes.js';

/**
 * The QR share code -- security layer 2 (spec section 4).
 *
 * Kept structurally distinct from the application lock. Section 4 is explicit that
 * the app PIN must never double as the QR password, so the two are branded types
 * that cannot be passed to each other's functions.
 */
declare const shareCodeBrand: unique symbol;
export type ShareCodeSecret = Bytes & { readonly [shareCodeBrand]: true };

/**
 * Crockford Base32. Excludes I, L, O and U -- I/L/O because they are misread as
 * 1/1/0, U to avoid accidental profanity in a code someone has to read aloud.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** 8 characters x 5 bits = 40 bits of entropy. */
const CODE_LENGTH = 8;

/**
 * Generate a share code.
 *
 * Why generated rather than user-chosen: an offline QR can be photographed and
 * cracked on the attacker's own machine, where the app's rate limiting does not
 * exist. Argon2id buys a large constant factor but a 4-digit PIN still falls
 * instantly. These 40 bits are what actually makes the scheme sound.
 */
export function generateShareCode(): string {
  // Rejection sampling. Taking a raw byte modulo 32 would be uniform here since
  // 256 is a multiple of 32, but masking is clearer about the intent and stays
  // correct if ALPHABET ever changes length.
  const out: string[] = [];
  while (out.length < CODE_LENGTH) {
    const buf = randomBytes(CODE_LENGTH);
    for (const byte of buf) {
      const idx = byte & 0x1f; // 0-31
      if (out.length < CODE_LENGTH) out.push(ALPHABET[idx]!);
    }
    wipe(buf);
  }
  return out.join('');
}

/** Group for display: K7F2-QM9X. Purely presentational. */
export function formatShareCode(code: string): string {
  const clean = code.replace(/[\s-]/g, '').toUpperCase();
  return clean.length === CODE_LENGTH ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean;
}

/**
 * Normalise a generated share code into KDF input bytes.
 *
 * Both devices must produce identical bytes or the derived keys differ and the
 * user sees "wrong password" with no way to tell why. This is the single most
 * likely interop bug in the whole format, so the steps are fixed:
 *
 *   1. trim   2. strip spaces and hyphens   3. uppercase
 *   4. Crockford input mapping (I,L -> 1; O -> 0)   5. UTF-8
 */
export function normalizeShareCode(input: string): ShareCodeSecret {
  const normalized = input
    .trim()
    .replace(/[\s-]/g, '')
    .toUpperCase()
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0');
  return utf8(normalized) as ShareCodeSecret;
}

/**
 * Normalise an owner-supplied passphrase.
 *
 * Deliberately NOT the same as normalizeShareCode: a passphrase is
 * case-sensitive and may legitimately contain spaces, so only trimming and UTF-8
 * encoding apply. Both paths yield bytes the KDF consumes, so this distinction is
 * a UX contract rather than part of the wire format.
 */
export function normalizePassphrase(input: string): ShareCodeSecret {
  return utf8(input.trim()) as ShareCodeSecret;
}

/** Does a custom passphrase carry enough entropy to be worth allowing? */
export function isAcceptablePassphrase(input: string): boolean {
  const p = input.trim();
  if (p.length < 12) return false;
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((re) => re.test(p)).length;
  return classes >= 2;
}
