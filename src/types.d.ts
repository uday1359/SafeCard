/**
 * A Uint8Array backed specifically by an ArrayBuffer rather than a
 * SharedArrayBuffer.
 *
 * TypeScript 5.7 made typed arrays generic over their backing buffer, and the
 * Web Crypto and WebAssembly signatures require `ArrayBuffer` specifically -- a
 * SharedArrayBuffer cannot be used as a `BufferSource` because another thread
 * could mutate it mid-operation. Since every buffer in this codebase is
 * single-owner and wipeable by design, pinning the parameter here is accurate
 * rather than merely convenient, and it keeps the crypto call sites free of casts.
 */
type Bytes = Uint8Array<ArrayBuffer>;

/**
 * Minimal shape of Vite's import.meta.env, declared here so the WASM loader
 * typechecks under plain `tsc` as well as under Vite. Optional throughout: in
 * Node (tests, CI) there is no import.meta.env at all.
 */
interface ImportMeta {
  readonly env?: { readonly BASE_URL?: string };
}
