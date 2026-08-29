import { type DBSchema, type IDBPDatabase, openDB } from 'idb';

import type { VaultMeta } from './vault.js';

/**
 * IndexedDB access.
 *
 * `idb` is here rather than raw IndexedDB because the native API is event-based
 * and its transactions auto-commit the moment the microtask queue drains -- which
 * means an `await` in the middle of a transaction silently aborts it. That is a
 * data-loss bug that only shows up under load. `idb` is a promise wrapper with no
 * transitive dependencies, which keeps it acceptable under the dependency rule in
 * the threat model's Scenario H.
 *
 * This layer knows nothing about encryption. It stores opaque byte blobs; what is
 * inside them is vault.ts's business. The one exception is the `meta` store, which
 * holds the cleartext vault parameters -- necessarily, since they are what lets us
 * derive the key to read everything else.
 */

export const DB_NAME = 'safecard';
export const DB_VERSION = 1;

export const STORE = {
  /** Cleartext vault parameters. No personal information. */
  meta: 'meta',
  /** Encrypted blobs, keyed by a caller-defined string. */
  records: 'records',
  /** Non-sensitive UI preferences, in cleartext -- theme and the like. */
  settings: 'settings',
} as const;

/** The single key under which the vault parameters live. */
export const VAULT_META_KEY = 'vault';

interface SafeCardDB extends DBSchema {
  [STORE.meta]: { key: string; value: VaultMeta };
  [STORE.records]: { key: string; value: Bytes };
  [STORE.settings]: { key: string; value: string | number | boolean };
}

let dbPromise: Promise<IDBPDatabase<SafeCardDB>> | null = null;

export function openDatabase(): Promise<IDBPDatabase<SafeCardDB>> {
  dbPromise ??= openDB<SafeCardDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Version 1. Every later version adds a numbered branch here rather than
      // editing this one -- an installed app upgrades from whatever version it
      // has, so past migrations must stay exactly as they shipped.
      if (!db.objectStoreNames.contains(STORE.meta)) db.createObjectStore(STORE.meta);
      if (!db.objectStoreNames.contains(STORE.records)) db.createObjectStore(STORE.records);
      if (!db.objectStoreNames.contains(STORE.settings)) db.createObjectStore(STORE.settings);
    },
    blocking() {
      // Another tab is upgrading. Close so it is not blocked; this tab's next
      // call reopens at the new version. Errors are reported rather than left as
      // an unhandled rejection raised from inside an IndexedDB event callback,
      // where nothing above can see them.
      closeDatabase().catch((err: unknown) => {
        console.error('safecard: failed to close the database for an upgrade', err);
      });
    },
  });

  /**
   * Do not let one failure become permanent.
   *
   * `??=` only assigns when the slot is nullish, and a *rejected* promise is
   * neither null nor undefined -- so without this, a single transient failure
   * (an upgrade blocked by another tab, storage pressure, private-mode quirks)
   * would be cached and every later call would fail against it for the life of
   * the page. Clearing the slot on rejection is what makes a retry possible.
   *
   * That matters beyond robustness here: callers read a failure to open as "no
   * vault exists", and a permanently-failing handle turns a recoverable blip
   * into a user being offered a fresh vault over the top of their real one.
   */
  return dbPromise.catch((err: unknown) => {
    dbPromise = null;
    throw err;
  });
}

export async function closeDatabase(): Promise<void> {
  if (!dbPromise) return;
  const db = await dbPromise;
  db.close();
  dbPromise = null;
}

export async function readVaultMeta(): Promise<VaultMeta | undefined> {
  const db = await openDatabase();
  const stored = await db.get(STORE.meta, VAULT_META_KEY);
  if (!stored) return undefined;

  /**
   * The same copy `readRecord` makes, for the same reason.
   *
   * Structured clone hands back fresh typed arrays, but not ones narrowed to an
   * `ArrayBuffer` -- which is what Web Crypto requires, and what the `Bytes`
   * alias promises every consumer of this module. `readRecord` has always
   * copied on the way out; this path did not, and the asymmetry was the only
   * reason the two behaved differently on identical data.
   *
   * These bytes go straight into Argon2 and AES-GCM by way of `unlockVault`, so
   * "it happens to work in a browser" is a thinner guarantee than it looks:
   * anything that returns a typed array from another realm or over a
   * `SharedArrayBuffer` fails deep inside the KDF, as a type error with nothing
   * in it to point back here.
   */
  return {
    ...stored,
    kdfSalt: Uint8Array.from(stored.kdfSalt),
    wrappedDek: Uint8Array.from(stored.wrappedDek),
  };
}

export async function writeVaultMeta(meta: VaultMeta): Promise<void> {
  const db = await openDatabase();
  await db.put(STORE.meta, meta, VAULT_META_KEY);
}

/**
 * Write the vault parameters only if no vault exists, atomically.
 *
 * Creating a vault is the one write in the app that can destroy data: it
 * replaces the salt and the wrapped DEK, and every record already stored is
 * encrypted under the old DEK, which nothing can recover afterwards.
 *
 * A `hasVault()` check followed by `writeVaultMeta()` is not enough, because
 * those are two transactions with a gap between them -- a second tab can create
 * a vault inside that gap and this one will happily overwrite it. `add()` fails
 * with a `ConstraintError` when the key is already present, and it does so inside
 * the same transaction as the check, which is what makes the guarantee real
 * rather than merely likely.
 *
 * Returns false if a vault was already there. The caller must treat that as
 * "unlock instead", never as an error to retry.
 */
export async function createVaultMetaIfAbsent(meta: VaultMeta): Promise<boolean> {
  const db = await openDatabase();
  try {
    await db.add(STORE.meta, meta, VAULT_META_KEY);
    return true;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'ConstraintError') return false;
    throw err;
  }
}

export async function hasVault(): Promise<boolean> {
  return (await readVaultMeta()) !== undefined;
}

export async function readRecord(key: string): Promise<Bytes | undefined> {
  const db = await openDatabase();
  const stored = await db.get(STORE.records, key);
  // Structured clone hands back a fresh Uint8Array already, but its buffer type
  // is not narrowed to ArrayBuffer, which Web Crypto requires. Copy to be sure.
  return stored ? Uint8Array.from(stored) : undefined;
}

export async function writeRecord(key: string, blob: Bytes): Promise<void> {
  const db = await openDatabase();
  await db.put(STORE.records, blob, key);
}

export async function deleteRecord(key: string): Promise<void> {
  const db = await openDatabase();
  await db.delete(STORE.records, key);
}

export async function readSetting(key: string): Promise<string | number | boolean | undefined> {
  const db = await openDatabase();
  return db.get(STORE.settings, key);
}

export async function writeSetting(
  key: string,
  value: string | number | boolean,
): Promise<void> {
  const db = await openDatabase();
  await db.put(STORE.settings, value, key);
}

/**
 * Erase everything.
 *
 * Wipes the vault parameters too, which makes every remaining encrypted byte
 * permanently unreadable -- so this is genuinely destructive, not a soft reset.
 * Spec section 34 requires the user be able to do this.
 */
export async function destroyEverything(): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction([STORE.meta, STORE.records, STORE.settings], 'readwrite');
  await Promise.all([
    tx.objectStore(STORE.meta).clear(),
    tx.objectStore(STORE.records).clear(),
    tx.objectStore(STORE.settings).clear(),
    tx.done,
  ]);
}

/**
 * Ask the browser not to evict this origin's data.
 *
 * Scenario G in the threat model: browser storage is evictable, and a user whose
 * emergency card silently vanished is worse off than one who never trusted it.
 * Returns whether the origin is persisted -- the caller should treat `false` as a
 * reason to push the encrypted backup, not as an error.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
