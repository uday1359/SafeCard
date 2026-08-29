// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { qrDownloadName } from '../../src/ui/OwnerPanel.js';

/**
 * The downloaded QR must not be named after the secret that opens it.
 *
 * The filename used to be `safecard-${result.shareCode}.png`. A filename is not
 * a channel the owner controls: it appears in the Downloads listing, in OS
 * search indexes, in any cloud sync of that folder, and it travels with the file
 * into every message the PNG is attached to. Naming the image after the code
 * makes one artefact that unlocks itself, which is exactly what keeping the QR
 * and the code on separate channels (section 4) exists to prevent.
 */
describe('the downloaded QR filename', () => {
  it('carries nothing but a timestamp', () => {
    const name = qrDownloadName(new Date('2026-08-29T14:05:09.000Z'));

    expect(name).toBe('safecard-qr-2026-08-29-14-05-09.png');
  });

  /**
   * The timestamp does the one useful job the share code was doing -- telling
   * two downloads apart -- so it has to actually differ between them.
   */
  it('distinguishes downloads taken at different times', () => {
    const first = qrDownloadName(new Date('2026-08-29T14:05:09.000Z'));
    const second = qrDownloadName(new Date('2026-08-29T14:05:10.000Z'));

    expect(first).not.toBe(second);
  });

  it('is a safe filename on every platform', () => {
    // No colons: Windows rejects them outright, and a browser silently rewrites
    // the name rather than reporting that it did.
    expect(qrDownloadName()).toMatch(/^safecard-qr-[0-9-]+\.png$/);
  });
});
