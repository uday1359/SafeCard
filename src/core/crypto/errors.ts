/**
 * Decode failure taxonomy.
 *
 * Each code maps to exactly one user-facing message from spec section 40. The
 * mapping is deliberate and must not be broadened: section 18 requires that a
 * wrong password and a tampered payload are indistinguishable to the person
 * scanning, so both produce UNLOCK_FAILED. AES-GCM cannot tell them apart either.
 */

export type DecodeErrorCode =
  /** Gate 1 and gate 7 -- too short, or inflate/CBOR failed after a valid tag. */
  | 'CORRUPT'
  /** Gate 2 -- magic bytes absent. Not our QR at all. */
  | 'NOT_SAFECARD'
  /** Gates 3 and 4 -- format version or cipher suite newer than we understand. */
  | 'UNSUPPORTED_VERSION'
  /** Gate 5 -- KDF parameters outside safe bounds. Refused before allocating. */
  | 'UNSAFE_PARAMS'
  /** Gate 6 -- authentication failed: wrong share code, or the payload was altered. */
  | 'UNLOCK_FAILED';

const MESSAGES: Record<DecodeErrorCode, string> = {
  CORRUPT: 'The QR code could not be read. Please scan again.',
  NOT_SAFECARD: 'This does not appear to be a SafeCard QR code.',
  UNSUPPORTED_VERSION: 'Please update SafeCard to read this card.',
  UNSAFE_PARAMS: 'This QR code could not be read safely.',
  UNLOCK_FAILED: 'Unable to unlock this card. Please check the QR share password.',
};

export class DecodeError extends Error {
  readonly code: DecodeErrorCode;

  /** Safe to show to the user. Never contains payload bytes or secret material. */
  readonly userMessage: string;

  constructor(code: DecodeErrorCode, detail?: string) {
    // `detail` is developer context only and must never carry secrets.
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'DecodeError';
    this.code = code;
    this.userMessage = MESSAGES[code];
  }
}

export function userMessageFor(code: DecodeErrorCode): string {
  return MESSAGES[code];
}
