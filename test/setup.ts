/**
 * Platform primitives that jsdom does not provide, and one it provides wrongly.
 *
 * SafeCard treats Web Crypto and the compression streams as always present --
 * that is the whole reason there is no bundled zlib and no crypto library beyond
 * the Argon2 WASM (build-plan, dependency rule; every added dependency widens
 * Scenario H of the threat model). Real browsers have shipped both for years.
 *
 * Everything here is an artefact of the test environment, not a gap in the app.
 * Each shim is guarded on the symptom it fixes rather than on "are we in jsdom",
 * so it stops applying the moment the environment stops needing it -- and this
 * file is a no-op under the `node` environment, where the globals are already
 * right and overwriting them is the only way it could break something.
 */
import { webcrypto } from 'node:crypto';
import { CompressionStream, DecompressionStream } from 'node:stream/web';
import { TextEncoder as NodeTextEncoder } from 'node:util';

function define(name: string, value: unknown): void {
  Object.defineProperty(globalThis, name, {
    value,
    configurable: true,
    writable: true,
  });
}

// jsdom exposes a `crypto` carrying only getRandomValues and randomUUID in some
// versions; the absence of `subtle` is what matters, so that is what is tested.
if (!globalThis.crypto?.subtle) {
  define('crypto', webcrypto);
}

if (typeof globalThis.CompressionStream === 'undefined') {
  define('CompressionStream', CompressionStream);
  define('DecompressionStream', DecompressionStream);
}

/**
 * Return `TextEncoder` output to the realm everything else lives in.
 *
 * jsdom runs the page in its own JavaScript realm with its own intrinsics, so
 * `new Uint8Array(...)` produces a *jsdom* Uint8Array. Its `TextEncoder`,
 * however, is Node's -- jsdom re-exports it -- and Node's encoder returns a
 * *Node* Uint8Array. The two are structurally identical and fail `instanceof`
 * against each other.
 *
 * That split runs straight through `utf8()`, which is how every passphrase and
 * share code reaches the KDF. The Argon2 library resolves `Uint8Array` to the
 * ambient (jsdom) constructor, so a perfectly good key derivation dies on
 * `concatArrays: Data must be in the form of a Uint8Array` -- a realm boundary
 * reported as a type error, several layers below where it was crossed, and with
 * nothing in the message to suggest the environment is at fault.
 *
 * Copying into an ambient-realm buffer restores the single-realm assumption a
 * browser actually satisfies. The alternative -- contorting `secureBytes.ts`
 * around a condition production never meets -- would mean the test environment
 * dictating the shape of security-critical code, which is backwards.
 */
if (!(new TextEncoder().encode('') instanceof Uint8Array)) {
  class RealmLocalTextEncoder {
    readonly encoding = 'utf-8';

    encode(input = ''): Uint8Array {
      const bytes = new NodeTextEncoder().encode(input);
      // `new Uint8Array` here is the ambient constructor -- the whole point.
      const out = new Uint8Array(bytes.length);
      out.set(bytes);
      return out;
    }

    encodeInto(source: string, destination: Uint8Array) {
      return new NodeTextEncoder().encodeInto(source, destination);
    }
  }

  define('TextEncoder', RealmLocalTextEncoder);
}
