// @vitest-environment jsdom
import 'fake-indexeddb/auto';

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Argon2Params } from '../../src/core/crypto/argon2.js';
import { normalizeLockPassphrase } from '../../src/core/crypto/lockSecret.js';
import { sampleDraft } from '../../src/core/model/draft.js';
import { loadCard, saveCard } from '../../src/core/store/cardRepository.js';
import { createVault, unlockVault } from '../../src/core/store/vault.js';
import { useVault } from '../../src/ui/useVault.js';

/**
 * The vault state machine.
 *
 * Everything here is about the transitions, not the cryptography -- vault.test.ts
 * already proves the envelope. What this file protects is the set of decisions
 * `useVault` makes *around* that envelope, every one of which was previously
 * defended by a comment and nothing else:
 *
 *   - a storage failure must land on `unavailable`, never on `setup`
 *   - `create` must not overwrite a vault that appeared since the page loaded
 *   - a wrong passphrase must surface only the user-safe message
 *   - a *failed* erase must never look like a successful one
 *
 * Each of those is a path to unrecoverable data loss or a silent security
 * downgrade, and none of them is reachable from a test that stops at `src/core/`.
 */

/**
 * Force the two failures that cannot be provoked through the real database.
 *
 * Hoisted because `vi.mock` factories run before the imports above. Only the two
 * functions whose failure modes are under test are replaced; everything else is
 * the genuine `idb`-backed implementation running against fake-indexeddb, so the
 * atomicity of `createVaultMetaIfAbsent` is exercised for real rather than
 * stubbed into always agreeing with us.
 */
const control = vi.hoisted(() => ({ failOpen: false, failErase: false }));

vi.mock('../../src/core/store/db.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/store/db.js')>();
  return {
    ...actual,
    hasVault: async () => {
      if (control.failOpen) throw new Error('simulated IndexedDB open failure');
      return actual.hasVault();
    },
    destroyEverything: async () => {
      if (control.failErase) throw new Error('simulated erase failure');
      return actual.destroyEverything();
    },
  };
});

const { createVaultMetaIfAbsent, destroyEverything, readVaultMeta } = await import(
  '../../src/core/store/db.js'
);

/** Cheap but above the gate-5 floor, matching vault.test.ts. */
const FAST: Argon2Params = { memKiB: 8 * 1024, time: 1, parallelism: 1 };

const PASSPHRASE = 'correct horse battery staple';
const OTHER_TAB = 'a different long passphrase';

/**
 * Put a vault on the device the way another tab would have.
 *
 * Deliberately written at the `FAST` cost: the hook's own `create` uses the real
 * 128 MiB vault default, and paying that for fixtures as well would triple the
 * runtime of this file for no extra coverage.
 */
async function seedVault(passphrase = PASSPHRASE) {
  const { meta, dek } = await createVault(normalizeLockPassphrase(passphrase), FAST);
  const written = await createVaultMetaIfAbsent(meta);
  expect(written).toBe(true);
  return { meta, dek };
}

function mountVault() {
  return renderHook(() => useVault());
}

beforeEach(async () => {
  control.failOpen = false;
  control.failErase = false;
  // The hook logs the causes it cannot show the user. Silenced so a passing run
  // is quiet, but kept as a spy because one test asserts it was called.
  vi.spyOn(console, 'error').mockImplementation(() => {});
  await destroyEverything();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('deciding what the device already holds', () => {
  it('offers setup when no vault exists yet', async () => {
    const { result } = mountVault();

    expect(result.current.status).toBe('checking');
    await waitFor(() => expect(result.current.status).toBe('setup'));
    expect(result.current.dek).toBeNull();
  });

  it('asks for the passphrase when a vault already exists', async () => {
    await seedVault();

    const { result } = mountVault();

    await waitFor(() => expect(result.current.status).toBe('locked'));
    expect(result.current.dek).toBeNull();
  });

  /**
   * The one that matters most in this file.
   *
   * "I cannot open the database" is not "there is no vault". Treating it as one
   * puts a create-a-passphrase form in front of someone whose cards are sitting
   * right there, and the success path of that form replaces the salt and the
   * wrapped DEK -- leaving every stored record encrypted under a key that no
   * longer exists anywhere. The assertion is written as an explicit `not.toBe`
   * as well as a positive one, because `setup` is the specific wrong answer.
   */
  it('reports unavailable, and never setup, when storage cannot be opened', async () => {
    control.failOpen = true;

    const { result } = mountVault();

    await waitFor(() => expect(result.current.status).not.toBe('checking'));
    expect(result.current.status).toBe('unavailable');
    expect(result.current.status).not.toBe('setup');
    expect(result.current.dek).toBeNull();
    expect(result.current.error).toBeTruthy();
    // The user cannot act on this one, so the developer must be able to see it.
    expect(console.error).toHaveBeenCalled();
  });
});

describe('creating a vault', () => {
  it('comes back unlocked with a key that actually decrypts', async () => {
    const { result } = mountVault();
    await waitFor(() => expect(result.current.status).toBe('setup'));

    await act(async () => {
      await result.current.create(PASSPHRASE);
    });

    expect(result.current.status).toBe('unlocked');
    expect(result.current.dek).not.toBeNull();

    // A non-null CryptoKey is not proof of anything on its own. Round-trip a
    // card through it so the test fails if the key is ever the wrong one.
    const draft = sampleDraft();
    await saveCard(result.current.dek!, draft);
    expect(await loadCard(result.current.dek!)).toEqual(draft);
  });

  /**
   * The screen showing the create form is only evidence of what was true when
   * the page loaded. Another tab can create a vault in between, and this tab
   * must lose that race rather than win it destructively.
   */
  it('refuses to overwrite a vault that appeared after the form was shown', async () => {
    const { result } = mountVault();
    await waitFor(() => expect(result.current.status).toBe('setup'));

    // The second tab gets there first.
    await seedVault(OTHER_TAB);

    await act(async () => {
      await result.current.create(PASSPHRASE);
    });

    expect(result.current.status).toBe('locked');
    expect(result.current.dek).toBeNull();
    expect(result.current.error).toMatch(/already exists/i);

    // The refusal is only worth anything if the original vault still opens.
    const meta = await readVaultMeta();
    expect(meta).toBeDefined();
    await expect(
      unlockVault(meta!, normalizeLockPassphrase(OTHER_TAB)),
    ).resolves.toBeDefined();
  });
});

describe('unlocking', () => {
  it('opens the vault with the right passphrase', async () => {
    await seedVault();
    const { result } = mountVault();
    await waitFor(() => expect(result.current.status).toBe('locked'));

    await act(async () => {
      await result.current.unlock(PASSPHRASE);
    });

    expect(result.current.status).toBe('unlocked');
    expect(result.current.dek).not.toBeNull();
  });

  /**
   * Section 18, applied to storage: the screen gets `userMessage` and nothing
   * else. `VaultError.message` carries developer context deliberately, and the
   * whole point of the split is that it never travels to the UI.
   */
  it('shows only the user-safe message on a wrong passphrase', async () => {
    await seedVault();
    const { result } = mountVault();
    await waitFor(() => expect(result.current.status).toBe('locked'));

    await act(async () => {
      await result.current.unlock('not the right passphrase');
    });

    expect(result.current.status).toBe('locked');
    expect(result.current.dek).toBeNull();
    expect(result.current.error).toBe('Unable to unlock. Please check your passphrase.');
    expect(result.current.error).not.toMatch(/DEK|UNLOCK_FAILED|GCM|Argon|salt/i);
  });

  it('sends the user to setup if the vault was erased in another tab', async () => {
    await seedVault();
    const { result } = mountVault();
    await waitFor(() => expect(result.current.status).toBe('locked'));

    await destroyEverything();

    await act(async () => {
      await result.current.unlock(PASSPHRASE);
    });

    expect(result.current.status).toBe('setup');
    expect(result.current.error).toMatch(/no vault/i);
  });
});

describe('locking', () => {
  async function unlocked() {
    await seedVault();
    const handle = mountVault();
    await waitFor(() => expect(handle.result.current.status).toBe('locked'));
    await act(async () => {
      await handle.result.current.unlock(PASSPHRASE);
    });
    expect(handle.result.current.status).toBe('unlocked');
    return handle;
  }

  it('drops the key on an explicit lock', async () => {
    const { result } = await unlocked();

    act(() => {
      result.current.lock();
    });

    expect(result.current.status).toBe('locked');
    expect(result.current.dek).toBeNull();
  });

  /**
   * build-plan 2.3: a backgrounded tab stays fully resident in memory, so the
   * user switching apps does not by itself drop anything. This listener is the
   * only thing that does.
   */
  it('drops the key when the tab is hidden', async () => {
    const { result } = await unlocked();

    act(() => {
      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(result.current.status).toBe('locked');
    expect(result.current.dek).toBeNull();
  });
});

describe('erasing everything', () => {
  it('leaves no vault behind', async () => {
    await seedVault();
    const { result } = mountVault();
    await waitFor(() => expect(result.current.status).toBe('locked'));

    await act(async () => {
      await result.current.destroy();
    });

    expect(result.current.status).toBe('setup');
    expect(result.current.dek).toBeNull();
    expect(await readVaultMeta()).toBeUndefined();
  });

  /**
   * A failed erase must never look like a successful one.
   *
   * The scenario is someone wiping the device before handing it on. If the
   * promise rejects and the screen quietly returns to normal, they believe the
   * cards are gone while the cards are still there -- and still unlocked.
   * Reporting the failure *is* the control, so this asserts both halves: the
   * status does not advance, and the data really is still present.
   */
  it('reports a failed erase instead of claiming success', async () => {
    await seedVault();
    const { result } = mountVault();
    await waitFor(() => expect(result.current.status).toBe('locked'));
    await act(async () => {
      await result.current.unlock(PASSPHRASE);
    });
    expect(result.current.status).toBe('unlocked');

    control.failErase = true;
    await act(async () => {
      await result.current.destroy();
    });

    expect(result.current.status).not.toBe('setup');
    expect(result.current.error).toMatch(/still on this device/i);
    expect(await readVaultMeta()).toBeDefined();
  });
});
