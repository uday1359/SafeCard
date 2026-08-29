import { type Argon2Params, deriveAesKey } from '../crypto/argon2.js';
import {
  KEY_LEN,
  NONCE_LEN,
  SALT_LEN,
  TAG_LEN,
  VAULT_ARGON_DEFAULTS,
} from '../crypto/constants.js';
import { assertSafeKdfParams } from '../crypto/header.js';
import type { LockSecret } from '../crypto/lockSecret.js';
import { concatBytes, randomBytes, utf8, wipe } from '../crypto/secureBytes.js';

/**
 * Encryption at rest.
 *
 * This module is the storage counterpart to the QR codec, and it borrows the
 * codec's shape on purpose -- same AES-256-GCM, same Argon2id, same "validate the
 * KDF parameters before allocating" rule. It is deliberately storage-agnostic:
 * it moves bytes, never touching IndexedDB, so the whole security surface is
 * testable in Node without a browser or a database.
 *
 * The scheme is standard envelope encryption:
 *
 *   passphrase --Argon2id--> KEK --wraps--> DEK --encrypts--> every record
 *
 * The indirection is what makes "change your passphrase" cheap. Re-deriving the
 * KEK and re-wrapping a 32-byte DEK rewrites one small record; without it,
 * changing the passphrase would mean decrypting and re-encrypting every card,
 * photo and setting in the database.
 */

/** Bumping this is a migration, not a formatting change. See docs/build-plan.md Phase 2. */
export const VAULT_FMT_VERSION = 1;

/** Length of the wrapped DEK blob: nonce, then ciphertext, then GCM tag. */
export const WRAPPED_DEK_LEN = NONCE_LEN + KEY_LEN + TAG_LEN; // 60

/**
 * The one record stored in cleartext.
 *
 * It has to be: the KDF parameters and salt are needed to derive the key that
 * decrypts everything else, so they cannot themselves be encrypted. Nothing here
 * is personal information -- it is a salt, three cost parameters and a wrapped
 * key, none of which say anything about the user.
 */
export interface VaultMeta {
  fmtVersion: number;
  kdf: Argon2Params;
  kdfSalt: Bytes;
  wrappedDek: Bytes;
  createdAt: number;
}

export type VaultErrorCode =
  /** The passphrase was wrong, or the stored vault was altered. Indistinguishable. */
  | 'UNLOCK_FAILED'
  /** Vault written by a newer build. */
  | 'UNSUPPORTED_VERSION'
  /** Structurally invalid, or hostile KDF parameters. */
  | 'CORRUPT';

const VAULT_MESSAGES: Record<VaultErrorCode, string> = {
  UNLOCK_FAILED: 'Unable to unlock. Please check your passphrase.',
  UNSUPPORTED_VERSION: 'This data was saved by a newer version of SafeCard. Please update.',
  CORRUPT: 'The saved data could not be read.',
};

export class VaultError extends Error {
  readonly code: VaultErrorCode;
  /** Safe to show to the user. Never contains stored bytes or secret material. */
  readonly userMessage: string;

  constructor(code: VaultErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'VaultError';
    this.code = code;
    this.userMessage = VAULT_MESSAGES[code];
  }
}

/**
 * Canonical byte encoding of the vault parameters, used as AES-GCM additional
 * authenticated data when wrapping the DEK.
 *
 * Same reasoning as the QR header being the codec's AAD: these parameters sit in
 * cleartext where anything with write access to IndexedDB can edit them. Binding
 * them to the wrapped DEK means an attacker who rewrites `memKiB` down to 8 MiB,
 * hoping to make an offline passphrase attack cheap, gets an authentication
 * failure instead of a weakly-protected vault.
 */
function vaultAad(fmtVersion: number, kdf: Argon2Params, kdfSalt: Bytes): Bytes {
  let saltHex = '';
  for (const b of kdfSalt) saltHex += b.toString(16).padStart(2, '0');
  return utf8(
    `safecard-vault/v${fmtVersion}/${kdf.memKiB}/${kdf.time}/${kdf.parallelism}/${saltHex}`,
  );
}

/**
 * Additional authenticated data for a single record.
 *
 * Binds the ciphertext to the exact slot it lives in. Without this, an attacker
 * with write access to the database could copy the blob from one key to another
 * -- swapping a stale card over the current one, or moving a record between
 * stores -- and every byte would still authenticate correctly. With it, a moved
 * record fails to decrypt.
 */
function recordAad(storeName: string, key: string): Bytes {
  return utf8(`safecard-record/v${VAULT_FMT_VERSION}/${storeName}/${key}`);
}

/**
 * Validate stored vault parameters before deriving anything from them.
 *
 * This is gate 5 applied to storage, and it is a security control rather than a
 * tidiness check. `VaultMeta` is cleartext: anything with write access to
 * IndexedDB can edit it, and once encrypted backup import lands it can arrive
 * from a file the user was sent -- exactly as attacker-controlled as a QR header.
 * A vault declaring 4 GiB of Argon2 memory would hang or kill the tab, and the
 * GCM tag that would expose the tampering cannot be checked until after the KDF
 * has already run.
 *
 * Every function that derives a key from `meta` must call this FIRST. It lives in
 * one place because it previously did not: `unlockVault` validated and
 * `unwrapDekBytes` did not, so re-wrapping under an explicitly supplied cost
 * reached Argon2 with unvalidated stored parameters.
 */
function assertVaultMetaSafe(meta: VaultMeta): void {
  if (meta.fmtVersion > VAULT_FMT_VERSION) {
    throw new VaultError('UNSUPPORTED_VERSION', `vault fmtVersion ${meta.fmtVersion}`);
  }
  if (meta.kdfSalt.length !== SALT_LEN || meta.wrappedDek.length !== WRAPPED_DEK_LEN) {
    throw new VaultError('CORRUPT', 'malformed vault meta');
  }
  try {
    assertSafeKdfParams(meta.kdf.memKiB, meta.kdf.time, meta.kdf.parallelism);
  } catch {
    // Remap: the QR taxonomy's UNSAFE_PARAMS has no meaning for stored data.
    throw new VaultError('CORRUPT', 'stored KDF parameters out of range');
  }
}

/**
 * Create a new vault.
 *
 * The caller owns `secret` and must wipe it; this function wipes only what it
 * allocates, matching the convention in codec.ts and argon2.ts.
 */
export async function createVault(
  secret: LockSecret,
  kdf: Argon2Params = {
    memKiB: VAULT_ARGON_DEFAULTS.memKiB,
    time: VAULT_ARGON_DEFAULTS.time,
    parallelism: VAULT_ARGON_DEFAULTS.parallelism,
  },
): Promise<{ meta: VaultMeta; dek: CryptoKey }> {
  assertSafeKdfParams(kdf.memKiB, kdf.time, kdf.parallelism);

  const kdfSalt = randomBytes(SALT_LEN);
  const nonce = randomBytes(NONCE_LEN);
  const dekBytes = randomBytes(KEY_LEN);

  try {
    const kek = await deriveAesKey(secret, kdfSalt, kdf, ['encrypt']);
    const aad = vaultAad(VAULT_FMT_VERSION, kdf, kdfSalt);

    const sealed = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: nonce, additionalData: aad, tagLength: TAG_LEN * 8 },
        kek,
        dekBytes,
      ),
    );

    // Import before wiping: this is the only copy of the key material, and once
    // it is inside a non-extractable CryptoKey the raw bytes are no longer needed
    // anywhere in the JS heap.
    const dek = await importDek(dekBytes);

    return {
      meta: {
        fmtVersion: VAULT_FMT_VERSION,
        kdf,
        kdfSalt,
        wrappedDek: concatBytes(nonce, sealed),
        createdAt: Math.floor(Date.now() / 1000),
      },
      dek,
    };
  } finally {
    wipe(dekBytes);
  }
}

/**
 * Unlock an existing vault, returning the data encryption key.
 *
 * Validates the stored parameters before deriving anything. That matters more
 * than it looks: once encrypted backup import lands (Phase 2, build plan), a
 * `VaultMeta` can arrive from a file the user was sent, at which point it is
 * exactly as attacker-controlled as a QR header -- and a vault declaring 4 GiB of
 * Argon2 memory would hang the tab. This is gate 5, reused verbatim.
 */
export async function unlockVault(meta: VaultMeta, secret: LockSecret): Promise<CryptoKey> {
  assertVaultMetaSafe(meta);

  const kek = await deriveAesKey(secret, meta.kdfSalt, meta.kdf, ['decrypt']);
  const aad = vaultAad(meta.fmtVersion, meta.kdf, meta.kdfSalt);
  const nonce = meta.wrappedDek.subarray(0, NONCE_LEN);
  const body = meta.wrappedDek.subarray(NONCE_LEN);

  let dekBytes: Bytes | undefined;
  try {
    const opened = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: nonce, additionalData: aad, tagLength: TAG_LEN * 8 },
      kek,
      body,
    );
    dekBytes = new Uint8Array(opened);
    return await importDek(dekBytes);
  } catch (err) {
    if (err instanceof VaultError) throw err;
    // A wrong passphrase and a tampered vault both land here and both produce one
    // message, for the same reason section 18 requires it of the QR path: GCM
    // cannot tell them apart, so neither should we.
    throw new VaultError('UNLOCK_FAILED', 'DEK unwrap failed');
  } finally {
    wipe(dekBytes);
  }
}

/** Import raw DEK bytes as a non-extractable key. The caller wipes the bytes. */
async function importDek(dekBytes: Bytes): Promise<CryptoKey> {
  if (dekBytes.length !== KEY_LEN) {
    throw new VaultError('CORRUPT', `DEK length ${dekBytes.length}`);
  }
  return crypto.subtle.importKey('raw', dekBytes, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

/**
 * Re-wrap the DEK under a new passphrase.
 *
 * The DEK itself is unchanged, so every existing record stays readable and
 * nothing has to be rewritten. This is the payoff of the envelope design.
 */
export async function rewrapVault(
  meta: VaultMeta,
  currentSecret: LockSecret,
  nextSecret: LockSecret,
  kdf: Argon2Params = meta.kdf,
): Promise<VaultMeta> {
  // The requested new cost, and -- inside unwrapDekBytes -- the stored one the
  // current DEK is still wrapped under. Both reach Argon2; both are validated.
  try {
    assertSafeKdfParams(kdf.memKiB, kdf.time, kdf.parallelism);
  } catch {
    throw new VaultError('CORRUPT', 'requested KDF parameters out of range');
  }

  // Unwrap to raw bytes rather than a CryptoKey -- re-wrapping needs the material
  // itself, which a non-extractable key deliberately will not give back.
  const dekBytes = await unwrapDekBytes(meta, currentSecret);
  const kdfSalt = randomBytes(SALT_LEN);
  const nonce = randomBytes(NONCE_LEN);

  try {
    const kek = await deriveAesKey(nextSecret, kdfSalt, kdf, ['encrypt']);
    const aad = vaultAad(VAULT_FMT_VERSION, kdf, kdfSalt);
    const sealed = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: nonce, additionalData: aad, tagLength: TAG_LEN * 8 },
        kek,
        dekBytes,
      ),
    );
    return {
      fmtVersion: VAULT_FMT_VERSION,
      kdf,
      kdfSalt,
      wrappedDek: concatBytes(nonce, sealed),
      createdAt: meta.createdAt,
    };
  } finally {
    wipe(dekBytes);
  }
}

/** Raw DEK material. Only re-wrapping and backup export need this; both wipe it. */
async function unwrapDekBytes(meta: VaultMeta, secret: LockSecret): Promise<Bytes> {
  // Before deriveAesKey, never after: see assertVaultMetaSafe.
  assertVaultMetaSafe(meta);
  const kek = await deriveAesKey(secret, meta.kdfSalt, meta.kdf, ['decrypt']);
  const aad = vaultAad(meta.fmtVersion, meta.kdf, meta.kdfSalt);
  try {
    const opened = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: meta.wrappedDek.subarray(0, NONCE_LEN),
        additionalData: aad,
        tagLength: TAG_LEN * 8,
      },
      kek,
      meta.wrappedDek.subarray(NONCE_LEN),
    );
    return new Uint8Array(opened);
  } catch {
    throw new VaultError('UNLOCK_FAILED', 'DEK unwrap failed');
  }
}

/**
 * Encrypt one record.
 *
 * A fresh nonce per write, never derived from the record key -- the same slot is
 * overwritten every time the user edits a card, and reusing a nonce under one key
 * is the catastrophic failure mode for GCM.
 *
 * The caller owns `plaintext` and must wipe it.
 */
export async function encryptRecord(
  dek: CryptoKey,
  storeName: string,
  key: string,
  plaintext: Bytes,
): Promise<Bytes> {
  const nonce = randomBytes(NONCE_LEN);
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: nonce,
        additionalData: recordAad(storeName, key),
        tagLength: TAG_LEN * 8,
      },
      dek,
      plaintext,
    ),
  );
  return concatBytes(nonce, sealed);
}

/** Decrypt one record. Returns bytes the caller owns and should wipe. */
export async function decryptRecord(
  dek: CryptoKey,
  storeName: string,
  key: string,
  blob: Bytes,
): Promise<Bytes> {
  if (blob.length < NONCE_LEN + TAG_LEN) {
    throw new VaultError('CORRUPT', `record ${blob.length} bytes is too short`);
  }
  try {
    const opened = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: blob.subarray(0, NONCE_LEN),
        additionalData: recordAad(storeName, key),
        tagLength: TAG_LEN * 8,
      },
      dek,
      blob.subarray(NONCE_LEN),
    );
    return new Uint8Array(opened);
  } catch {
    throw new VaultError('UNLOCK_FAILED', 'record authentication failed');
  }
}
