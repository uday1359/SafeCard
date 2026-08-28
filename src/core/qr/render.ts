import QRCode from 'qrcode';

/**
 * Render payload bytes as a QR code.
 *
 * Byte mode, ECC level M -- exactly what docs/qr-payload-format.md specifies.
 * Both endpoints are our own app, so no Base45 or Base64 armour is needed and
 * byte mode is denser.
 */
export interface RenderedQr {
  dataUrl: string;
  /** QR symbol version, 1-40. Useful for showing how close we are to the limit. */
  version: number;
  /** Side length in modules, for the same reason. */
  modules: number;
  byteLength: number;
}

export async function renderQr(payload: Bytes, pixels = 320): Promise<RenderedQr> {
  const segments = [{ data: payload, mode: 'byte' as const }];

  const symbol = QRCode.create(segments, { errorCorrectionLevel: 'M' });
  const dataUrl = await QRCode.toDataURL(segments, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: pixels,
  });

  return {
    dataUrl,
    version: symbol.version,
    modules: symbol.version * 4 + 17,
    byteLength: payload.length,
  };
}
