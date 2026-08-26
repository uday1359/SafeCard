import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';

/**
 * Decode a QR code from an image.
 *
 * Safari and every browser on iOS lack the BarcodeDetector API, and a large share
 * of emergency *recipients* are on an iPhone. So the WASM decoder is the primary
 * implementation here, not a fallback -- BarcodeDetector is the optimisation, to
 * be layered on in Phase 5 alongside the live camera path.
 *
 * The same code path serves drag-drop and paste on desktop, which is what
 * replaced an entire separate Windows scanning workstream in the native plan.
 */

let prepared = false;
let wasmUrl = '/wasm/zxing_reader.wasm';
let wasmBinary: ArrayBuffer | null = null;

/**
 * Override where the decoder's WASM comes from.
 *
 * `binary` takes precedence and skips fetching entirely. Emscripten only knows
 * how to `fetch()` a `locateFile` result, which works for a same-origin URL in
 * the browser but not for a filesystem path under Node -- so tests supply the
 * bytes instead. Production always uses the same-origin default; the CSP forbids
 * anything else.
 */
export function configureQrDecoderWasm(source: string | ArrayBuffer): void {
  if (typeof source === 'string') {
    wasmUrl = source;
    wasmBinary = null;
  } else {
    wasmBinary = source;
  }
  prepared = false;
}

function ensurePrepared(): void {
  if (prepared) return;
  prepareZXingModule({
    overrides: wasmBinary
      ? { wasmBinary }
      : {
          // Served from our own origin. zxing-wasm would otherwise fetch from a
          // CDN, which the CSP forbids and which would break offline use.
          locateFile: (path: string) => (path.endsWith('.wasm') ? wasmUrl : path),
        },
  });
  prepared = true;
}

/**
 * Returns the raw bytes carried by the QR, or null if no QR was found.
 *
 * Raw BYTES, not text: the payload is binary and any transcoding through a JS
 * string would corrupt it.
 */
export async function decodeQrImage(image: Blob | ImageData): Promise<Bytes | null> {
  ensurePrepared();

  const results = await readBarcodes(image, {
    formats: ['QRCode'],
    tryHarder: true,
  });

  const hit = results[0];
  if (!hit) return null;

  const bytes = hit.bytes as Uint8Array | undefined;
  if (bytes && bytes.length > 0) {
    const out = new Uint8Array(bytes.length);
    out.set(bytes);
    return out;
  }

  // Some builds surface only text. Latin-1 maps bytes 1:1 to code points, so this
  // recovers the original octets where the byte array is unavailable.
  const text = hit.text;
  if (!text) return null;
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff;
  return out;
}
