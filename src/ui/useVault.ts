import { useCallback, useEffect, useRef, useState } from 'react';

import { normalizeLockPassphrase } from '../core/crypto/lockSecret.js';
import { wipe } from '../core/crypto/secureBytes.js';
import {
  createVaultMetaIfAbsent,
  destroyEverything,
  hasVault,
  readVaultMeta,
  requestPersistentStorage,
} from '../core/store/db.js';
import { createVault, unlockVault, VaultError } from '../core/store/vault.js';

/**
 * The vault state machine.
 *
 *   checking -> setup       (nothing stored yet; the user chooses a passphrase)
 *   checking -> locked      (a vault exists; the user must unlock it)
 *   checking -> unavailable (storage could not be opened; we cannot tell)
 *   locked   -> unlocked    (correct passphrase; the DEK is live in memory)
 *   unlocked -> locked      (explicit lock, or the tab going into the background)
 *
 * The DEK is held in React state rather than a module-level variable so that it
 * is dropped when the component unmounts, and so nothing outside this hook can
 * reach for it.
 *
 * `unavailable` exists because the alternative was dangerous. Failing to open
 * IndexedDB used to fall through to `setup`, which silently reinterprets "I
 * cannot tell whether a vault exists" as "there is no vault" -- and then offers
 * the user a create-a-passphrase form whose success path overwrites the vault
 * meta. A fresh salt and a fresh DEK over an existing vault leaves every stored
 * record encrypted under a key that no longer exists anywhere. An honest dead end
 * is better than a create button that can destroy the data it is protecting.
 */
export type VaultStatus = 'checking' | 'setup' | 'locked' | 'unlocked' | 'unavailable';

export interface Vault {
  status: VaultStatus;
  dek: CryptoKey | null;
  busy: boolean;
  error: string | null;
  persisted: boolean;
  create: (passphrase: string) => Promise<void>;
  unlock: (passphrase: string) => Promise<void>;
  lock: () => void;
  destroy: () => Promise<void>;
}

export function useVault(): Vault {
  const [status, setStatus] = useState<VaultStatus>('checking');
  const [dek, setDek] = useState<CryptoKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [persisted, setPersisted] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    void hasVault()
      .then((exists) => {
        if (mounted.current) setStatus(exists ? 'locked' : 'setup');
      })
      .catch((err: unknown) => {
        // Never fall through to 'setup' here: see the note on VaultStatus. The
        // cause is logged because this is the one failure the user cannot act on
        // and the developer cannot otherwise see.
        console.error('safecard: could not open encrypted storage', err);
        if (mounted.current) {
          setStatus('unavailable');
          setError('Encrypted storage is unavailable in this browser.');
        }
      });
    return () => {
      mounted.current = false;
    };
  }, []);

  const lock = useCallback(() => {
    // Dropping the CryptoKey reference is the whole wipe: the key material lives
    // inside the browser's crypto implementation, never in the JS heap, so there
    // are no bytes of our own left to zero.
    setDek(null);
    setStatus((s) => (s === 'unlocked' ? 'locked' : s));
  }, []);

  /**
   * Lock when the tab goes away.
   *
   * build-plan section 2.3: bfcache keeps a backgrounded tab fully alive in
   * memory, secrets included, so "the user switched apps" does not by itself
   * drop anything. `pagehide` and `visibilitychange` are both needed -- iOS
   * Safari does not reliably fire the ones you expect.
   */
  useEffect(() => {
    if (status !== 'unlocked') return;
    const onHidden = () => {
      if (document.visibilityState === 'hidden') lock();
    };
    window.addEventListener('pagehide', lock);
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      window.removeEventListener('pagehide', lock);
      document.removeEventListener('visibilitychange', onHidden);
    };
  }, [status, lock]);

  const create = useCallback(async (passphrase: string) => {
    setBusy(true);
    setError(null);
    const secret = normalizeLockPassphrase(passphrase);
    try {
      /**
       * Never overwrite an existing vault.
       *
       * Creating one replaces `VAULT_META_KEY` with a fresh salt and a fresh
       * DEK, leaving every stored record encrypted under a key that no longer
       * exists -- unrecoverable, and silent. The screen showing this form is
       * only evidence of what was true when the app loaded; another tab may have
       * created a vault since.
       *
       * The refusal is `createVaultMetaIfAbsent`'s to make, not ours: a
       * `hasVault()` test here would leave a gap between the check and the write.
       * The DEK generated just above is simply dropped when it returns false.
       */
      const { meta, dek: key } = await createVault(secret);
      if (!(await createVaultMetaIfAbsent(meta))) {
        setStatus('locked');
        setError('A vault already exists on this device. Unlock it instead.');
        return;
      }
      setDek(key);
      setStatus('unlocked');
      // Ask only after there is something worth keeping; a prompt before the user
      // has saved anything is noise, and some browsers count a refusal against you.
      setPersisted(await requestPersistentStorage());
    } catch (err) {
      // A VaultError is about the vault and is safe to show. Anything else is a
      // storage or programming failure: the user gets a generic line, and the
      // cause goes to the console rather than being swallowed.
      if (!(err instanceof VaultError)) {
        console.error('safecard: vault creation failed', err);
      }
      setError(err instanceof VaultError ? err.userMessage : 'Could not create the vault.');
    } finally {
      wipe(secret);
      setBusy(false);
    }
  }, []);

  const unlock = useCallback(async (passphrase: string) => {
    setBusy(true);
    setError(null);
    const secret = normalizeLockPassphrase(passphrase);
    try {
      const meta = await readVaultMeta();
      if (!meta) {
        // Reachable if the vault was erased in another tab between load and
        // submit. Say so, rather than silently swapping the form underneath.
        setStatus('setup');
        setError('There is no vault on this device any more. Create a new one.');
        return;
      }
      const key = await unlockVault(meta, secret);
      setDek(key);
      setStatus('unlocked');
      setPersisted(await requestPersistentStorage());
    } catch (err) {
      // Only ever the user-safe text. The developer detail on VaultError carries
      // context that must not reach the screen -- but a non-VaultError is a
      // storage or programming fault and must not vanish either.
      if (!(err instanceof VaultError)) {
        console.error('safecard: unlock failed', err);
      }
      setError(err instanceof VaultError ? err.userMessage : 'Could not unlock.');
    } finally {
      wipe(secret);
      setBusy(false);
    }
  }, []);

  const destroy = useCallback(async () => {
    setBusy(true);
    try {
      await destroyEverything();
      setDek(null);
      setStatus('setup');
      setError(null);
    } catch (err) {
      /**
       * A failed erase must never look like a successful one.
       *
       * Without this the promise rejected, the spinner stopped, and the screen
       * went back to normal -- so a user who pressed "erase everything" before
       * handing the device on would believe the cards were gone while they were
       * still there, still unlocked. Reporting the failure is the whole control.
       */
      console.error('safecard: erase failed', err);
      setError('Could not erase the stored data. It is still on this device.');
    } finally {
      setBusy(false);
    }
  }, []);

  return { status, dek, busy, error, persisted, create, unlock, lock, destroy };
}
