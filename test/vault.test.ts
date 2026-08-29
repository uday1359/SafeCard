import 'fake-indexeddb/auto';

import { beforeEach, describe, expect, it } from 'vitest';

import type { Argon2Params } from '../src/core/crypto/argon2.js';
import {
  ARGON_DEFAULTS,
  ARGON_MEM_MAX_KIB,
  KEY_LEN,
  VAULT_ARGON_DEFAULTS,
} from '../src/core/crypto/constants.js';
import {
  isAcceptableLockPassphrase,
  lockPassphraseProblem,
  normalizeLockPassphrase,
} from '../src/core/crypto/lockSecret.js';
import { utf8 } from '../src/core/crypto/secureBytes.js';
import { normalizeShareCode } from '../src/core/crypto/shareCode.js';
import { sampleDraft } from '../src/core/model/draft.js';
import {
  clearCard,
  CURRENT_CARD_KEY,
  loadCard,
  saveCard,
} from '../src/core/store/cardRepository.js';
import {
  closeDatabase,
  createVaultMetaIfAbsent,
  destroyEverything,
  readRecord,
  readVaultMeta,
  STORE,
  writeRecord,
  writeVaultMeta,
} from '../src/core/store/db.js';
import {
  createVault,
  decryptRecord,
  encryptRecord,
  rewrapVault,
  unlockVault,
  VaultError,
  WRAPPED_DEK_LEN,
} from '../src/core/store/vault.js';

/** Cheap but still above the gate-5 floor, so the real validation path runs. */
const FAST: Argon2Params = { memKiB: 8 * 1024, time: 1, parallelism: 1 };

const PASSPHRASE = 'correct horse battery staple';
const WRONG = 'incorrect horse battery staple';

/**
 * Await a rejection and narrow it to VaultError.
 *
 * Written as a helper because `.catch(e => e as VaultError)` widens the result to
 * include the success type, which then fails typecheck at every property access.
 */
async function vaultErrorFrom(promise: Promise<unknown>): Promise<VaultError> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof VaultError) return err;
    throw err;
  }
  throw new Error('expected the promise to reject with a VaultError');
}

async function freshVault(pass = PASSPHRASE) {
  const secret = normalizeLockPassphrase(pass);
  return createVault(secret, FAST);
}

beforeEach(async () => {
  await destroyEverything();
});

describe('vault envelope encryption', () => {
  it('round-trips a card through encryption at rest', async () => {
    const { meta, dek } = await freshVault();
    await writeVaultMeta(meta);

    const draft = sampleDraft();
    await saveCard(dek, draft);

    // Unlock from scratch, the way a page reload would.
    const storedMeta = await readVaultMeta();
    expect(storedMeta).toBeDefined();
    const reopened = await unlockVault(storedMeta!, normalizeLockPassphrase(PASSPHRASE));

    const loaded = await loadCard(reopened);
    expect(loaded).toEqual(draft);
  });

  it('returns null when nothing has been saved', async () => {
    const { dek } = await freshVault();
    expect(await loadCard(dek)).toBeNull();
  });

  it('forgets the card after clearCard', async () => {
    const { dek } = await freshVault();
    await saveCard(dek, sampleDraft());
    await clearCard();
    expect(await loadCard(dek)).toBeNull();
  });

  it('never stores the DEK in the clear', async () => {
    const { meta } = await freshVault();
    expect(meta.wrappedDek.length).toBe(WRAPPED_DEK_LEN);
    // A wrapped 32-byte key is 60 bytes: nonce, ciphertext, tag. Anything the
    // length of a bare key would mean the wrapping step was skipped.
    expect(meta.wrappedDek.length).not.toBe(KEY_LEN);
  });

  it('derives a non-extractable DEK', async () => {
    const { dek } = await freshVault();
    expect(dek.extractable).toBe(false);
    await expect(crypto.subtle.exportKey('raw', dek)).rejects.toThrow();
  });

  it('gives every vault a fresh salt', async () => {
    const a = await freshVault();
    const b = await freshVault();
    expect(Buffer.from(a.meta.kdfSalt)).not.toEqual(Buffer.from(b.meta.kdfSalt));
    expect(Buffer.from(a.meta.wrappedDek)).not.toEqual(Buffer.from(b.meta.wrappedDek));
  });

  it('gives every write a fresh nonce', async () => {
    const { dek } = await freshVault();
    const draft = sampleDraft();
    await saveCard(dek, draft);
    const first = await readRecord(CURRENT_CARD_KEY);
    await saveCard(dek, draft);
    const second = await readRecord(CURRENT_CARD_KEY);
    // Identical plaintext, same key, same slot -- the ciphertext must still differ,
    // or a nonce is being reused, which is the catastrophic failure mode for GCM.
    expect(Buffer.from(first!)).not.toEqual(Buffer.from(second!));
  });
});

describe('vault fails closed', () => {
  it('rejects a wrong passphrase', async () => {
    const { meta } = await freshVault();
    await expect(unlockVault(meta, normalizeLockPassphrase(WRONG))).rejects.toThrow(VaultError);
  });

  it('gives a wrong passphrase and a tampered vault the same message', async () => {
    const { meta } = await freshVault();

    const wrongErr = await vaultErrorFrom(unlockVault(meta, normalizeLockPassphrase(WRONG)));

    const tampered = { ...meta, wrappedDek: Uint8Array.from(meta.wrappedDek) };
    tampered.wrappedDek[20] = tampered.wrappedDek[20]! ^ 0xff;
    const tamperErr = await vaultErrorFrom(
      unlockVault(tampered, normalizeLockPassphrase(PASSPHRASE)),
    );

    // Section 18's rule, applied at rest: GCM cannot tell these apart, so the
    // user-visible text must not pretend otherwise.
    expect(wrongErr.userMessage).toBe(tamperErr.userMessage);
    expect(wrongErr.code).toBe(tamperErr.code);
  });

  it('detects a downgraded KDF cost in stored meta', async () => {
    const { meta } = await freshVault();
    // An attacker with write access to IndexedDB lowers the cost, hoping the next
    // unlock re-wraps at the weaker setting. The AAD binding makes it fail instead.
    const downgraded = { ...meta, kdf: { memKiB: 8 * 1024, time: 1, parallelism: 1 } };
    if (downgraded.kdf.memKiB === meta.kdf.memKiB && downgraded.kdf.time === meta.kdf.time) {
      downgraded.kdf = { memKiB: 16 * 1024, time: 1, parallelism: 1 };
    }
    await expect(
      unlockVault(downgraded, normalizeLockPassphrase(PASSPHRASE)),
    ).rejects.toThrow(VaultError);
  });

  it('rejects hostile KDF parameters before deriving anything', async () => {
    const { meta } = await freshVault();
    const hostile = { ...meta, kdf: { memKiB: 4 * 1024 * 1024, time: 1, parallelism: 1 } };

    const started = performance.now();
    const err = await vaultErrorFrom(unlockVault(hostile, normalizeLockPassphrase(PASSPHRASE)));
    const elapsed = performance.now() - started;

    expect(err.code).toBe('CORRUPT');
    // Gate 5's real assertion is about *when*, not just whether: this has to be
    // refused before 4 GiB is allocated, so it must return effectively instantly.
    expect(elapsed).toBeLessThan(250);
  });

  it('refuses a vault from a newer format version', async () => {
    const { meta } = await freshVault();
    const future = { ...meta, fmtVersion: meta.fmtVersion + 1 };
    const err = await vaultErrorFrom(unlockVault(future, normalizeLockPassphrase(PASSPHRASE)));
    expect(err.code).toBe('UNSUPPORTED_VERSION');
  });

  it('rejects a tampered record', async () => {
    const { dek } = await freshVault();
    await saveCard(dek, sampleDraft());

    const blob = await readRecord(CURRENT_CARD_KEY);
    blob![30] = blob![30]! ^ 0xff;
    await writeRecord(CURRENT_CARD_KEY, blob!);

    await expect(loadCard(dek)).rejects.toThrow(VaultError);
  });

  it('rejects a record moved to a different slot', async () => {
    const { dek } = await freshVault();
    const plaintext = new TextEncoder().encode('sensitive');

    const blob = await encryptRecord(dek, STORE.records, 'card:a', plaintext);

    // Same key, same bytes, different slot. The AAD binding is what makes this
    // fail; without it an attacker could swap records between ids undetected.
    await expect(decryptRecord(dek, STORE.records, 'card:b', blob)).rejects.toThrow(VaultError);
    await expect(decryptRecord(dek, STORE.records, 'card:a', blob)).resolves.toBeDefined();
  });

  it('rejects a truncated record', async () => {
    const { dek } = await freshVault();
    await expect(
      decryptRecord(dek, STORE.records, 'card:a', new Uint8Array(4)),
    ).rejects.toThrow(VaultError);
  });
});

describe('no plaintext at rest', () => {
  it('writes nothing recognisable from the card into IndexedDB', async () => {
    const { meta, dek } = await freshVault();
    await writeVaultMeta(meta);

    const draft = sampleDraft();
    await saveCard(dek, draft);

    const blob = await readRecord(CURRENT_CARD_KEY);
    const asText = Buffer.from(blob!).toString('latin1');

    // The build plan's verification step is "inspect IndexedDB in DevTools: no
    // plaintext PII". This is that check, automated.
    for (const needle of [
      draft.name,
      draft.bloodGroup,
      'Penicillin',
      'diabetes',
      'Insulin',
      draft.contacts[0]!.phone,
      'Apollo',
    ]) {
      expect(asText).not.toContain(needle);
    }

    // The cleartext meta record must not leak anything either.
    const metaText = JSON.stringify(await readVaultMeta());
    expect(metaText).not.toContain(draft.name);
    expect(metaText).not.toContain('Penicillin');
  });
});

describe('changing the passphrase', () => {
  it('keeps existing records readable under the new passphrase', async () => {
    const { meta, dek } = await freshVault();
    await writeVaultMeta(meta);
    const draft = sampleDraft();
    await saveCard(dek, draft);

    const next = 'a different passphrase entirely';
    const rewrapped = await rewrapVault(
      meta,
      normalizeLockPassphrase(PASSPHRASE),
      normalizeLockPassphrase(next),
      FAST,
    );
    await writeVaultMeta(rewrapped);

    // The DEK is unchanged, so the record was never rewritten -- that is the
    // whole point of wrapping a key rather than encrypting under the passphrase.
    const newDek = await unlockVault(rewrapped, normalizeLockPassphrase(next));
    expect(await loadCard(newDek)).toEqual(draft);

    await expect(
      unlockVault(rewrapped, normalizeLockPassphrase(PASSPHRASE)),
    ).rejects.toThrow(VaultError);
  });

  it('refuses to rewrap with the wrong current passphrase', async () => {
    const { meta } = await freshVault();
    await expect(
      rewrapVault(meta, normalizeLockPassphrase(WRONG), normalizeLockPassphrase('whatever'), FAST),
    ).rejects.toThrow(VaultError);
  });
});

describe('lock secret is not the share code', () => {
  it('normalises a passphrase differently from a share code', async () => {
    // The share code path folds case and maps Crockford lookalikes; the lock path
    // must not, or two distinct passphrases would collapse into one key.
    const text = 'Oil-Lamp';
    const asLock = Buffer.from(normalizeLockPassphrase(text)).toString('utf8');
    const asShare = Buffer.from(normalizeShareCode(text)).toString('utf8');

    // OILLAMP: the hyphen is dropped, I and both Ls map to 1, O maps to 0.
    expect(asLock).toBe('Oil-Lamp');
    expect(asShare).toBe('0111AMP');
    expect(asLock).not.toBe(asShare);
  });

  it('holds lock passphrases to a length and variety floor', () => {
    expect(isAcceptableLockPassphrase('short')).toBe(false);
    expect(isAcceptableLockPassphrase('alllowercaseletters')).toBe(false);
    expect(isAcceptableLockPassphrase('correct horse 9')).toBe(true);
  });
});

describe('destroying everything', () => {
  it('leaves no vault and no records behind', async () => {
    const { meta, dek } = await freshVault();
    await writeVaultMeta(meta);
    await saveCard(dek, sampleDraft());

    await destroyEverything();

    expect(await readVaultMeta()).toBeUndefined();
    expect(await readRecord(CURRENT_CARD_KEY)).toBeUndefined();
    await closeDatabase();
  });
});

/**
 * Regressions for the Phase 2 security pass.
 *
 * Each of these covers a hole that existed in the shipped code, so each should
 * fail if the corresponding guard is removed.
 */
describe('stored parameters are validated on every path that derives a key', () => {
  it('refuses hostile stored KDF parameters when re-wrapping, not only when unlocking', async () => {
    const { meta } = await freshVault();
    const hostile = { ...meta, kdf: { memKiB: 4 * 1024 * 1024, time: 1, parallelism: 1 } };

    // The explicit `kdf` argument is what made this reachable: with it, the
    // assertion at the top of rewrapVault covered the *new* cost while the
    // stored one still reached Argon2 unchecked.
    const started = performance.now();
    const err = await vaultErrorFrom(
      rewrapVault(
        hostile,
        normalizeLockPassphrase(PASSPHRASE),
        normalizeLockPassphrase('a different passphrase 9'),
        FAST,
      ),
    );
    const elapsed = performance.now() - started;

    expect(err.code).toBe('CORRUPT');
    expect(elapsed).toBeLessThan(250);
  });

  it('refuses a malformed stored salt when re-wrapping', async () => {
    const { meta } = await freshVault();
    const truncated = { ...meta, kdfSalt: meta.kdfSalt.subarray(0, 4) };

    const err = await vaultErrorFrom(
      rewrapVault(
        truncated,
        normalizeLockPassphrase(PASSPHRASE),
        normalizeLockPassphrase('a different passphrase 9'),
        FAST,
      ),
    );
    expect(err.code).toBe('CORRUPT');
  });

  it('reports an out-of-range requested cost as a vault error, not a QR decode error', async () => {
    const { meta } = await freshVault();
    const err = await vaultErrorFrom(
      rewrapVault(meta, normalizeLockPassphrase(PASSPHRASE), normalizeLockPassphrase(WRONG), {
        memKiB: 4 * 1024 * 1024,
        time: 1,
        parallelism: 1,
      }),
    );
    expect(err.code).toBe('CORRUPT');
  });
});

describe('the vault does not inherit the QR cost budget', () => {
  it('defaults to the vault parameters, which are stronger than the QR ones', async () => {
    const secret = normalizeLockPassphrase(PASSPHRASE);
    const { meta } = await createVault(secret);

    expect(meta.kdf.memKiB).toBe(VAULT_ARGON_DEFAULTS.memKiB);
    // The point of the split: lowering the QR cost for a low-end scanner must not
    // be able to weaken encryption at rest.
    expect(VAULT_ARGON_DEFAULTS.memKiB).toBeGreaterThan(ARGON_DEFAULTS.memKiB);
  });

  it('keeps the vault default inside the gate-5 ceiling', () => {
    expect(VAULT_ARGON_DEFAULTS.memKiB).toBeLessThanOrEqual(ARGON_MEM_MAX_KIB);
  });
});

describe('lock passphrase floor rejects what a composition rule waves through', () => {
  it('rejects the passphrases an attacker tries first', () => {
    // All of these satisfy ten characters and two character classes.
    expect(isAcceptableLockPassphrase('Password12')).toBe(false);
    expect(isAcceptableLockPassphrase('p@ssw0rd!!')).toBe(false);
    expect(isAcceptableLockPassphrase('qwertyuiop1')).toBe(false);
    expect(isAcceptableLockPassphrase('LetMeIn123')).toBe(false);
  });

  it('rejects a pattern with too few distinct characters', () => {
    expect(isAcceptableLockPassphrase('aaaaaaaaaa1')).toBe(false);
  });

  it('still accepts a long ordinary phrase', () => {
    expect(isAcceptableLockPassphrase(PASSPHRASE)).toBe(true);
    expect(isAcceptableLockPassphrase('correct horse 9')).toBe(true);
  });

  it('names the rule that was missed', () => {
    expect(lockPassphraseProblem('short')).toBe('too-short');
    expect(lockPassphraseProblem('Password12')).toBe('too-common');
    expect(lockPassphraseProblem('aaaaaaaaaa1')).toBe('too-repetitive');
    expect(lockPassphraseProblem(PASSPHRASE)).toBeNull();
  });
});

describe('a corrupt but authentic record fails as a vault error', () => {
  it('reports invalid JSON as CORRUPT rather than throwing a SyntaxError', async () => {
    const { dek } = await freshVault();

    // Authentic: encrypted under the real DEK, in the right slot, so the GCM tag
    // verifies and the failure happens at the parse step.
    const garbage = await encryptRecord(dek, STORE.records, CURRENT_CARD_KEY, utf8('not json {['));
    await writeRecord(CURRENT_CARD_KEY, garbage);

    const err = await vaultErrorFrom(loadCard(dek));
    expect(err.code).toBe('CORRUPT');
    expect(err.userMessage).toBe('The saved data could not be read.');
    await closeDatabase();
  });
});

describe('creating a vault cannot overwrite one', () => {
  it('refuses atomically when a vault already exists', async () => {
    const first = await freshVault();
    expect(await createVaultMetaIfAbsent(first.meta)).toBe(true);
    await saveCard(first.dek, sampleDraft());

    // A second tab, or a stale 'setup' screen, tries to create over the top.
    const second = await freshVault('a completely different passphrase 9');
    expect(await createVaultMetaIfAbsent(second.meta)).toBe(false);

    // The original vault is untouched, so the original card still decrypts.
    const stored = await readVaultMeta();
    const dek = await unlockVault(stored!, normalizeLockPassphrase(PASSPHRASE));
    expect((await loadCard(dek))?.name).toBe(sampleDraft().name);
    await closeDatabase();
  });

  it('leaves an existing vault readable even after a refused create', async () => {
    const { meta } = await freshVault();
    await createVaultMetaIfAbsent(meta);

    const intruder = await freshVault('another passphrase entirely 9');
    await createVaultMetaIfAbsent(intruder.meta);

    // The stored salt is still the first vault's, not the intruder's.
    const stored = await readVaultMeta();
    expect(Array.from(stored!.kdfSalt)).toEqual(Array.from(meta.kdfSalt));
    await closeDatabase();
  });
});
