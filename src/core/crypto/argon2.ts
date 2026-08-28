import { loadArgon2id } from './wasmLoader.js';

import { KEY_LEN } from './constants.js';
import { wipe } from './secureBytes.js';

export interface Argon2Params {
  memKiB: number;
  time: number;
  parallelism: number;
}

/**
 * Derive a 256-bit key from a share code.
 *
 * A fresh WASM instance is loaded per call, deliberately. The library's own
 * documentation notes that its WASM memory is cleared between runs but not
 * deallocated -- so a cached instance leaves a multi-megabyte buffer resident for
 * the lifetime of the page. Reloading costs tens of milliseconds against a
 * derivation measured in seconds, which is a good trade for not holding 32 MiB
 * of former key-derivation state in a tab that may be backgrounded.
 *
 * Callers are responsible for wiping `secret`; this function wipes only what it
 * allocates itself.
 */
export async function deriveKeyBytes(
  secret: Bytes,
  salt: Bytes,
  params: Argon2Params,
): Promise<Bytes> {
  const argon2id = await loadArgon2id();
  const raw = argon2id({
    password: secret,
    salt,
    parallelism: params.parallelism,
    passes: params.time,
    memorySize: params.memKiB,
    tagLength: KEY_LEN,
  });

  // Copy into a buffer we own, then wipe the library's. Its result may be a view
  // over WASM linear memory, which JS cannot reach once the instance is dropped --
  // so this is the only moment we can clear it.
  const key = new Uint8Array(raw.length);
  key.set(raw);
  wipe(raw as Bytes);
  return key;
}

/**
 * Derive a non-extractable AES-GCM CryptoKey.
 *
 * `extractable: false` means the browser keeps the key material inside its own
 * crypto implementation, where JS cannot read it -- strictly better than holding
 * raw key bytes we then have to remember to wipe. The intermediate bytes from
 * Argon2 are unavoidable (the KDF runs in WASM and hands them back), so they are
 * zeroed as soon as importKey has consumed them.
 */
export async function deriveAesKey(
  secret: Bytes,
  salt: Bytes,
  params: Argon2Params,
  usages: KeyUsage[],
): Promise<CryptoKey> {
  const raw = await deriveKeyBytes(secret, salt, params);
  try {
    return await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, usages);
  } finally {
    wipe(raw);
  }
}
