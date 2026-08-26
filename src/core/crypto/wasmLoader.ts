import setupWasm from 'argon2id/lib/setup.js';
import type { computeHash } from 'argon2id/lib/setup.js';

/**
 * WASM loading for the Argon2id implementation.
 *
 * The `argon2id` package's own entry point does `import wasm from './x.wasm'`,
 * which only works under a bundler configured with a WASM loader. We load the
 * bytes ourselves instead, for two reasons:
 *
 *  1. The same code path works in Node (tests, CI) and in the browser.
 *  2. In the browser the .wasm files are plain static assets under /wasm/, which
 *     means the service worker precaches them like any other asset. That is not
 *     cosmetic -- if the WASM is not cached, unlocking a card offline fails, and
 *     offline operation is the headline requirement (spec section 21).
 */

type WasmVariant = 'simd' | 'no-simd';

const byteCache = new Map<WasmVariant, Bytes>();

function isNode(): boolean {
  return typeof process !== 'undefined' && process.versions?.node != null;
}

async function loadBytes(variant: WasmVariant): Promise<Bytes> {
  const cached = byteCache.get(variant);
  if (cached) return cached;

  let bytes: Bytes;

  if (isNode()) {
    // Specifiers are assembled at runtime so the bundler cannot statically see
    // them. A literal 'node:fs/promises' gets resolved and stubbed into the
    // browser bundle even though this branch never executes there -- dead Node
    // shims have no business in a security-sensitive build.
    const nodeFs = 'node:' + 'fs/promises';
    const nodeModule = 'node:' + 'module';
    const [{ readFile }, { createRequire }] = await Promise.all([
      import(/* @vite-ignore */ nodeFs) as Promise<typeof import('node:fs/promises')>,
      import(/* @vite-ignore */ nodeModule) as Promise<typeof import('node:module')>,
    ]);
    const require = createRequire(import.meta.url);
    const path = require.resolve(`argon2id/dist/${variant}.wasm`);
    bytes = new Uint8Array(await readFile(path));
  } else {
    const res = await fetch(`${import.meta.env?.BASE_URL ?? '/'}wasm/${variant}.wasm`);
    if (!res.ok) throw new Error(`failed to load ${variant}.wasm: ${res.status}`);
    bytes = new Uint8Array(await res.arrayBuffer());
  }

  // The compiled module is public code, not secret material -- caching the bytes
  // is safe. It is the derived key and the 65 MB working memory that must not be
  // held, and those live in the instance, which we deliberately do not cache.
  byteCache.set(variant, bytes);
  return bytes;
}

function instantiator(variant: WasmVariant) {
  return async (imports: WebAssembly.Imports) =>
    WebAssembly.instantiate(await loadBytes(variant), imports);
}

/**
 * Build a fresh Argon2id instance.
 *
 * Intentionally not memoised. `setupWasm` allocates a WebAssembly.Memory with an
 * initial 65 MB that grows to fit the requested cost and is never shrunk -- the
 * library's own docs note the memory is cleared between runs but not deallocated.
 * A cached instance would therefore keep tens of megabytes of former
 * key-derivation state resident for the life of the page.
 */
export async function loadArgon2id(): Promise<computeHash> {
  return setupWasm(instantiator('simd'), instantiator('no-simd'));
}
