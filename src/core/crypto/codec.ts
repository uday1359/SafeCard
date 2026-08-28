import { deriveAesKey, type Argon2Params } from './argon2.js';
import { type CardPayload, decodeCard, encodeCard } from './cardPayload.js';
import {
  ARGON_DEFAULTS,
  FMT_VERSION,
  HEADER_LEN,
  MAX_PAYLOAD_BYTES,
  NONCE_LEN,
  SALT_LEN,
  SUITE_ID,
  TAG_LEN,
} from './constants.js';
import { DecodeError } from './errors.js';
import { bodyBytes, decodeHeader, encodeHeader, headerBytes } from './header.js';
import { concatBytes, randomBytes, wipe } from './secureBytes.js';
import type { ShareCodeSecret } from './shareCode.js';

/**
 * The SafeCard QR codec.
 *
 * Pipeline:  CBOR -> zlib -> AES-256-GCM(AAD = header) -> [header|ciphertext|tag]
 *
 * Compression uses the platform CompressionStream rather than a bundled zlib.
 * That is one fewer dependency in a security-sensitive bundle, and one fewer
 * entry point for the supply-chain scenario in the threat model.
 */

async function deflate(data: Bytes): Promise<Bytes> {
  const cs = new CompressionStream('deflate');
  const writer = cs.writable.getWriter();
  void writer.write(data);
  void writer.close();
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}

async function inflate(data: Bytes): Promise<Bytes> {
  const ds = new DecompressionStream('deflate');
  const writer = ds.writable.getWriter();
  void writer.write(data);
  void writer.close();
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}

export interface EncodeOptions {
  /** Override the KDF cost. Defaults to ARGON_DEFAULTS. */
  argon?: Argon2Params;
  /** Fixed salt and nonce, for reproducible test vectors ONLY. */
  deterministic?: { salt: Bytes; nonce: Bytes };
}

export class PayloadTooLargeError extends Error {
  constructor(
    readonly actual: number,
    readonly limit: number,
  ) {
    super(
      `Encoded payload is ${actual} bytes, over the ${limit}-byte QR budget. ` +
        `Share fewer fields or shorten free-text entries.`,
    );
    this.name = 'PayloadTooLargeError';
  }
}

/**
 * Encrypt a card into QR payload bytes.
 *
 * `secret` is normalised share-code bytes -- see shareCode.ts. The caller owns it
 * and is responsible for wiping it; this function does not, because the same
 * secret is often needed to render the code to the user afterwards.
 */
export async function encodePayload(
  card: CardPayload,
  secret: ShareCodeSecret,
  opts: EncodeOptions = {},
): Promise<Bytes> {
  const argon = opts.argon ?? {
    memKiB: ARGON_DEFAULTS.memKiB,
    time: ARGON_DEFAULTS.time,
    parallelism: ARGON_DEFAULTS.parallelism,
  };

  const salt = opts.deterministic?.salt ?? randomBytes(SALT_LEN);
  const nonce = opts.deterministic?.nonce ?? randomBytes(NONCE_LEN);

  const header = encodeHeader({
    fmtVersion: FMT_VERSION,
    suiteId: SUITE_ID,
    argonMemKiB: argon.memKiB,
    argonTime: argon.time,
    argonPar: argon.parallelism,
    salt,
    nonce,
  });

  const plaintext = encodeCard(card);
  let compressed: Bytes | undefined;

  try {
    compressed = await deflate(plaintext);
    const key = await deriveAesKey(secret, salt, argon, ['encrypt']);

    const sealed = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: nonce, additionalData: header, tagLength: TAG_LEN * 8 },
        key,
        compressed,
      ),
    );

    // WebCrypto appends the GCM tag to the ciphertext, so this concatenation
    // already produces [header | ciphertext | tag] as the format specifies.
    const payload = concatBytes(header, sealed);

    if (payload.length > MAX_PAYLOAD_BYTES) {
      throw new PayloadTooLargeError(payload.length, MAX_PAYLOAD_BYTES);
    }
    return payload;
  } finally {
    // The plaintext card is not a key, but it is the personal information this
    // whole application exists to protect. Do not leave it in the heap.
    wipe(plaintext, compressed);
  }
}

/**
 * Decrypt QR payload bytes back into a card.
 *
 * Gates 1-5 run inside decodeHeader, before any key derivation. Gate 6 is the
 * AES-GCM tag check, and gate 7 is inflate plus CBOR decode.
 */
export async function decodePayload(
  payload: Bytes,
  secret: ShareCodeSecret,
): Promise<CardPayload> {
  const header = decodeHeader(payload); // gates 1-5

  const key = await deriveAesKey(
    secret,
    header.salt,
    { memKiB: header.argonMemKiB, time: header.argonTime, parallelism: header.argonPar },
    ['decrypt'],
  );

  let plaintext: Bytes;
  try {
    // Gate 6. A wrong share code and a tampered payload both land here, and both
    // must produce the same message -- see errors.ts and spec section 18.
    const opened = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: header.nonce,
        additionalData: headerBytes(payload),
        tagLength: TAG_LEN * 8,
      },
      key,
      bodyBytes(payload),
    );
    plaintext = new Uint8Array(opened);
  } catch {
    throw new DecodeError('UNLOCK_FAILED', 'GCM authentication failed');
  }

  // Gate 7. Reaching here with a valid tag means the bytes are authentic, so a
  // failure now indicates a version skew or a bug on our side, not an attacker.
  let inflated: Bytes | undefined;
  try {
    inflated = await inflate(plaintext);
    return decodeCard(inflated);
  } catch (err) {
    throw new DecodeError('CORRUPT', `post-auth decode failed: ${String(err)}`);
  } finally {
    wipe(plaintext, inflated);
  }
}

/**
 * Exact encoded size, without deriving a key.
 *
 * AES-GCM is length-preserving, so ciphertext length equals compressed-plaintext
 * length and the total is knowable from compression alone. That means the UI can
 * show a live byte count as the user types -- no Argon2, no 130 ms wait per
 * keystroke.
 *
 * Worth doing because section 30's size limit is otherwise invisible until
 * generation fails. This turns "your QR is too big" into a meter the owner can
 * watch while deciding what to share.
 */
export async function estimatePayloadSize(card: CardPayload): Promise<number> {
  const plaintext = encodeCard(card);
  let compressed: Bytes | undefined;
  try {
    compressed = await deflate(plaintext);
    return compressed.length + HEADER_LEN + TAG_LEN;
  } finally {
    wipe(plaintext, compressed);
  }
}

/** Secondary share channel for when no camera is available. Same bytes. */
export function toBase64Url(payload: Bytes): string {
  let bin = '';
  for (const b of payload) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(text: string): Bytes {
  const b64 = text.trim().replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
