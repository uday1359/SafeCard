// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { RecipientPanel } from '../../src/ui/RecipientPanel.js';

/**
 * The harness hand-off between the two panels.
 *
 * `App.tsx` passes the freshly generated payload across so the loop can be
 * exercised on one machine. That prop was accepted and then never used: the
 * payload never arrived, the placeholder said the opposite of what was
 * happening, and the README documented the autofill as working. Nothing caught
 * it because nothing above `src/core/` had a test.
 *
 * The security-relevant half is the second describe block. Autofilling the
 * payload is a harness convenience; autofilling the *share code* would quietly
 * demonstrate a loop the real product does not have, because a real recipient
 * has to obtain that code through a different channel (section 4).
 */

afterEach(cleanup);

const PAYLOAD = 'U0MBAQAACAAAAwEC-fake-base64url-payload';

function payloadField() {
  return screen.getByLabelText('Payload text') as HTMLTextAreaElement;
}

function shareCodeField() {
  return screen.getByLabelText('Share code') as HTMLInputElement;
}

describe('receiving a payload from the owner panel', () => {
  it('fills the payload field from the generated QR', () => {
    render(<RecipientPanel autofill={PAYLOAD} />);

    expect(payloadField().value).toBe(PAYLOAD);
  });

  it('leaves the field empty when nothing has been generated', () => {
    render(<RecipientPanel />);

    expect(payloadField().value).toBe('');
  });

  it('replaces the previous payload when a new QR is generated', () => {
    const { rerender } = render(<RecipientPanel autofill={PAYLOAD} />);
    expect(payloadField().value).toBe(PAYLOAD);

    rerender(<RecipientPanel autofill="U0MBsecond-payload" />);

    expect(payloadField().value).toBe('U0MBsecond-payload');
  });

  /**
   * The placeholder previously appeared only when autofill *was* present, and
   * told the user to generate a QR to fill the field in -- advice that was both
   * backwards and unreachable. It is only ever seen on an empty field now.
   */
  it('does not tell the user to do something that already happened', () => {
    render(<RecipientPanel autofill={PAYLOAD} />);

    expect(payloadField().placeholder).not.toMatch(/fill this in/i);
  });
});

describe('the share code stays on its own channel', () => {
  it('is never filled in for the recipient', () => {
    render(<RecipientPanel autofill={PAYLOAD} />);

    expect(shareCodeField().value).toBe('');
  });

  /**
   * With the payload in place and no code, there is nothing to unlock with. The
   * disabled button is what makes the missing half visible rather than letting
   * the user press it and read a failure they cannot interpret.
   */
  it('cannot unlock on the payload alone', () => {
    render(<RecipientPanel autofill={PAYLOAD} />);

    const unlock = screen.getByRole('button', { name: /unlock card/i }) as HTMLButtonElement;
    expect(unlock.disabled).toBe(true);
  });
});
