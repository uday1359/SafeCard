import { useState } from 'react';

import {
  type LockPassphraseProblem,
  lockPassphraseProblem,
  MIN_LOCK_PASSPHRASE_LENGTH,
} from '../core/crypto/lockSecret.js';
import { IconLock } from './graphics.js';
import type { Vault } from './useVault.js';

/**
 * Say which rule was missed, not just that one was.
 *
 * "Not strong enough" with no reason is worked around by appending `1!`, which
 * produces exactly the passphrase the check exists to reject.
 */
const PASSPHRASE_HELP: Record<LockPassphraseProblem, string> = {
  'too-short': `Use at least ${MIN_LOCK_PASSPHRASE_LENGTH} characters.`,
  'too-uniform': 'Add a number or some punctuation, or make it a longer phrase.',
  'too-common': 'That is one of the first passphrases an attacker tries. Choose another.',
  'too-repetitive': 'Too few different characters. Use a phrase rather than a pattern.',
};

/**
 * The unlock screen.
 *
 * Two modes off one component because they share every control: `setup` when no
 * vault exists yet, `locked` when one does.
 *
 * The passphrase lives in React state as a string, which cannot be wiped -- the
 * unavoidable leak documented in secureBytes.ts. It is converted to bytes inside
 * useVault and cleared from this component as soon as the attempt resolves, which
 * is the only mitigation JavaScript allows.
 */
export function LockPanel({ vault }: { vault: Vault }) {
  const isSetup = vault.status === 'setup';
  const [passphrase, setPassphrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);

  const problem = lockPassphraseProblem(passphrase);
  const strongEnough = problem === null;
  // Compare the trimmed forms: normalizeLockPassphrase trims before deriving, so
  // two entries differing only in surrounding space produce the same key and must
  // not be reported as a mismatch.
  const matches = passphrase.trim() === confirm.trim();
  const canSubmit = isSetup
    ? strongEnough && matches && !vault.busy
    : passphrase.length > 0 && !vault.busy;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    const entered = passphrase;
    setPassphrase('');
    setConfirm('');
    if (isSetup) await vault.create(entered);
    else await vault.unlock(entered);
  }

  return (
    <section className="panel panel--lock">
      <div className="panel__head">
        <IconLock />
        <h2>{isSetup ? 'Protect your card' : 'Unlock SafeCard'}</h2>
      </div>

      <p className="lock__intro">
        {isSetup ? (
          <>
            Your card is encrypted on this device with a passphrase only you know. Choose one you
            can remember — <strong>it cannot be reset or recovered</strong>, because nothing is
            stored anywhere else.
          </>
        ) : (
          <>Enter your passphrase to decrypt the card stored on this device.</>
        )}
      </p>

      <form onSubmit={(e) => void submit(e)}>
        <label className="field">
          <span>Passphrase</span>
          <input
            type={show ? 'text' : 'password'}
            value={passphrase}
            autoFocus
            autoComplete={isSetup ? 'new-password' : 'current-password'}
            onChange={(e) => setPassphrase(e.target.value)}
            aria-describedby={isSetup ? 'passphrase-help' : undefined}
          />
        </label>

        {isSetup && (
          <>
            <label className="field">
              <span>Confirm passphrase</span>
              <input
                type={show ? 'text' : 'password'}
                value={confirm}
                autoComplete="new-password"
                onChange={(e) => setConfirm(e.target.value)}
              />
            </label>
            <p id="passphrase-help" className="lock__help">
              At least {MIN_LOCK_PASSPHRASE_LENGTH} characters, mixing letters with numbers or
              punctuation.
              {passphrase.length > 0 && problem !== null && (
                <strong className="lock__warn"> {PASSPHRASE_HELP[problem]}</strong>
              )}
              {confirm.length > 0 && !matches && (
                <strong className="lock__warn"> The two entries do not match.</strong>
              )}
            </p>
          </>
        )}

        <label className="field field--check">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
          <span>Show passphrase</span>
        </label>

        {vault.error && (
          <p className="lock__error" role="alert">
            {vault.error}
          </p>
        )}

        <button className="btn btn--primary btn--lg" type="submit" disabled={!canSubmit}>
          {vault.busy
            ? 'Working…'
            : isSetup
              ? 'Create encrypted card storage'
              : 'Unlock'}
        </button>
      </form>

      <p className="lock__note">
        Deriving the key takes a moment on purpose — it is what makes a stolen device expensive to
        attack. This passphrase protects the card <em>on this device</em>; the code that protects a
        QR you share with someone else is separate and generated per QR.
      </p>
    </section>
  );
}
