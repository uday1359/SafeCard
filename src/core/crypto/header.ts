import {
  ARGON_MEM_MAX_KIB,
  ARGON_MEM_MIN_KIB,
  ARGON_PAR_MAX,
  ARGON_TIME_MAX,
  HEADER_LEN,
  MAGIC,
  MAX_SUPPORTED_FMT_VERSION,
  NONCE_LEN,
  OFF,
  OVERHEAD_LEN,
  SALT_LEN,
  SUPPORTED_SUITE_IDS,
} from './constants.js';
import { DecodeError } from './errors.js';

export interface PayloadHeader {
  fmtVersion: number;
  suiteId: number;
  argonMemKiB: number;
  argonTime: number;
  argonPar: number;
  salt: Bytes;
  nonce: Bytes;
}

/**
 * Serialise the header.
 *
 * The header travels in cleartext because a recipient must read the KDF
 * parameters before it can derive a key. It is passed as AES-GCM additional
 * authenticated data, so tampering with it -- notably downgrading argonMemKiB to
 * make cracking cheap -- fails the tag check instead of silently succeeding.
 */
export function encodeHeader(h: PayloadHeader): Bytes {
  if (h.salt.length !== SALT_LEN) {
    throw new Error(`salt must be ${SALT_LEN} bytes, got ${h.salt.length}`);
  }
  if (h.nonce.length !== NONCE_LEN) {
    throw new Error(`nonce must be ${NONCE_LEN} bytes, got ${h.nonce.length}`);
  }

  const out = new Uint8Array(HEADER_LEN);
  const view = new DataView(out.buffer);

  out.set(MAGIC, OFF.magic);
  out[OFF.fmtVersion] = h.fmtVersion;
  out[OFF.suiteId] = h.suiteId;
  view.setUint32(OFF.argonMemKiB, h.argonMemKiB, false); // big-endian
  out[OFF.argonTime] = h.argonTime;
  out[OFF.argonPar] = h.argonPar;
  out.set(h.salt, OFF.salt);
  out.set(h.nonce, OFF.nonce);

  return out;
}

/**
 * Parse and validate a header.
 *
 * Gates 1-5 from docs/qr-payload-format.md all run here, and all run BEFORE any
 * Argon2 work. That ordering is the point: a junk QR is rejected instantly rather
 * than after 32 MiB and two seconds of key derivation.
 */
export function decodeHeader(payload: Bytes): PayloadHeader {
  // Gate 1 -- long enough to contain a header, a tag, and at least some ciphertext.
  if (payload.length < OVERHEAD_LEN) {
    throw new DecodeError('CORRUPT', `payload ${payload.length} < ${OVERHEAD_LEN}`);
  }

  // Gate 2 -- is this ours at all?
  if (payload[OFF.magic] !== MAGIC[0] || payload[OFF.magic + 1] !== MAGIC[1]) {
    throw new DecodeError('NOT_SAFECARD', 'magic mismatch');
  }

  const fmtVersion = payload[OFF.fmtVersion]!;
  const suiteId = payload[OFF.suiteId]!;

  // Gate 3 -- a newer card from someone with a newer app is routine, not an error.
  if (fmtVersion > MAX_SUPPORTED_FMT_VERSION) {
    throw new DecodeError('UNSUPPORTED_VERSION', `fmtVersion ${fmtVersion}`);
  }

  // Gate 4 -- unknown cipher suite.
  if (!SUPPORTED_SUITE_IDS.includes(suiteId)) {
    throw new DecodeError('UNSUPPORTED_VERSION', `suiteId ${suiteId}`);
  }

  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const argonMemKiB = view.getUint32(OFF.argonMemKiB, false);
  const argonTime = payload[OFF.argonTime]!;
  const argonPar = payload[OFF.argonPar]!;

  // Gate 5 -- refuse hostile KDF parameters BEFORE allocating anything.
  assertSafeKdfParams(argonMemKiB, argonTime, argonPar);

  return {
    fmtVersion,
    suiteId,
    argonMemKiB,
    argonTime,
    argonPar,
    // Copy rather than subarray: these outlive the caller's buffer.
    salt: payload.slice(OFF.salt, OFF.salt + SALT_LEN),
    nonce: payload.slice(OFF.nonce, OFF.nonce + NONCE_LEN),
  };
}

/** Gate 5. See the rationale on ARGON_MEM_MIN_KIB in constants.ts. */
export function assertSafeKdfParams(memKiB: number, time: number, par: number): void {
  if (memKiB > ARGON_MEM_MAX_KIB) {
    throw new DecodeError('UNSAFE_PARAMS', `memKiB ${memKiB} above ceiling`);
  }
  if (memKiB < ARGON_MEM_MIN_KIB) {
    throw new DecodeError('UNSAFE_PARAMS', `memKiB ${memKiB} below floor`);
  }
  if (time > ARGON_TIME_MAX || time < 1) {
    throw new DecodeError('UNSAFE_PARAMS', `time ${time}`);
  }
  if (par > ARGON_PAR_MAX || par < 1) {
    throw new DecodeError('UNSAFE_PARAMS', `parallelism ${par}`);
  }
}

/** The header slice, for use as AES-GCM additional authenticated data. */
export function headerBytes(payload: Bytes): Bytes {
  return payload.subarray(0, HEADER_LEN);
}

/** Ciphertext plus the trailing GCM tag -- what WebCrypto's decrypt() expects. */
export function bodyBytes(payload: Bytes): Bytes {
  return payload.subarray(HEADER_LEN);
}
