/**
 * Wire-format constants for the SafeCard QR payload.
 *
 * These values ARE the interoperability contract. Changing any of them changes
 * what other installations can read. See docs/qr-payload-format.md.
 */

/** ASCII "SC". Lets us reject a non-SafeCard QR instantly, before any KDF work. */
export const MAGIC = Uint8Array.from([0x53, 0x43]);

/** Format version carried at byte 2. */
export const FMT_VERSION = 1;

/** Highest format version this build can read. */
export const MAX_SUPPORTED_FMT_VERSION = 1;

/** Suite 1 = Argon2id + AES-256-GCM, salt 16, nonce 12, tag 16. */
export const SUITE_ID = 1;
export const SUPPORTED_SUITE_IDS: readonly number[] = [SUITE_ID];

export const SALT_LEN = 16;
export const NONCE_LEN = 12;
export const TAG_LEN = 16;
export const KEY_LEN = 32;

/** Header is bytes [0, 38). The whole header is passed as AES-GCM AAD. */
export const HEADER_LEN = 38;

/** Fixed cost of the envelope, independent of card content. */
export const OVERHEAD_LEN = HEADER_LEN + TAG_LEN; // 54

/**
 * Hard ceiling on the complete payload.
 *
 * ~600 bytes sits around QR version 20 at ECC level M, which scans reliably off
 * a phone screen and off printed paper. Enforced by a test that fails the build,
 * so nobody adds a shared field without noticing the cost.
 */
export const MAX_PAYLOAD_BYTES = 600;

/** Header field offsets. */
export const OFF = {
  magic: 0,
  fmtVersion: 2,
  suiteId: 3,
  argonMemKiB: 4,
  argonTime: 8,
  argonPar: 9,
  salt: 10,
  nonce: 26,
} as const;

/**
 * KDF parameter bounds, enforced BEFORE allocating memory.
 *
 * This is a security control, not a formality. The header is attacker-controlled
 * until the GCM tag verifies, and the tag cannot verify until after the KDF has
 * already run. Without an upper bound, a QR declaring 4 GiB of Argon2 memory
 * hangs or kills the scanning device -- a denial of service that costs the
 * attacker nothing to print on a sticker.
 *
 * The lower bound matters too: it refuses a payload from a hostile generator that
 * looks legitimate but was made trivially cheap to crack.
 */
export const ARGON_MEM_MIN_KIB = 8 * 1024; // 8 MiB
export const ARGON_MEM_MAX_KIB = 256 * 1024; // 256 MiB
export const ARGON_TIME_MAX = 10;
export const ARGON_PAR_MAX = 4;

/**
 * Target parameters for newly generated QRs.
 *
 * Above the OWASP floor of 19 MiB / t=2. Provisional: the Phase 0 benchmark on a
 * real low-end phone browser sets the final values. Browser tabs run under much
 * tighter memory budgets than native apps and iOS Safari kills memory-hungry tabs,
 * so these may have to come down -- if they do, say so in the privacy copy rather
 * than absorbing the loss of margin silently.
 */
export const ARGON_DEFAULTS = {
  memKiB: 32 * 1024, // 32 MiB
  time: 3,
  parallelism: 1,
} as const;
