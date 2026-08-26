/**
 * Helpers for handling secret material.
 *
 * The rule for this codebase: secrets live in Uint8Array, never in a string.
 *
 * JavaScript strings are immutable and interned -- you cannot overwrite one, and
 * the engine may keep copies alive indefinitely where they can surface in a heap
 * snapshot or in swap. Typed arrays are mutable and can genuinely be zeroed.
 *
 * Where a key is only ever used to encrypt or decrypt, prefer a non-extractable
 * CryptoKey over raw bytes entirely: the browser keeps the key material inside its
 * own crypto implementation and it never enters the JS heap at all.
 */

/** Overwrite a buffer in place. Safe to call on an already-detached array. */
export function wipe(...buffers: (Bytes | undefined | null)[]): void {
  for (const b of buffers) {
    // A transferred ArrayBuffer is detached and byteLength drops to 0; fill()
    // would throw on some engines, so guard rather than assume.
    if (b && b.byteLength > 0) {
      try {
        b.fill(0);
      } catch {
        // Detached buffer -- the bytes are already gone from this realm.
      }
    }
  }
}

/**
 * Run `fn`, then wipe `buffers` whether it succeeded or threw.
 *
 * Using this consistently is what keeps the wipe from being forgotten on the
 * error path, which is exactly where it tends to be forgotten.
 */
export async function withWipe<T>(
  buffers: Bytes[],
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } finally {
    wipe(...buffers);
  }
}

/**
 * Encode text as UTF-8 bytes.
 *
 * The caller is handed a string by the DOM (an <input> value) and there is no way
 * around that -- this is the one unavoidable leak. Convert on the first line,
 * clear the input immediately, and keep the window short.
 */
export function utf8(text: string): Bytes {
  return new TextEncoder().encode(text);
}

/** Constant-time comparison. Avoids leaking match position through timing. */
export function timingSafeEqual(a: Bytes, b: Bytes): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export function randomBytes(length: number): Bytes {
  return crypto.getRandomValues(new Uint8Array(length));
}

export function concatBytes(...parts: Bytes[]): Bytes {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}
