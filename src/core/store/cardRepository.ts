import { utf8, wipe } from '../crypto/secureBytes.js';
import type { DraftCard } from '../model/draft.js';
import { deleteRecord, readRecord, STORE, writeRecord } from './db.js';
import { decryptRecord, encryptRecord, VaultError } from './vault.js';

/**
 * Card persistence.
 *
 * Encryption is invisible from here outwards: callers hand over a `DraftCard` and
 * get one back. Nothing above this layer should ever see a nonce, a tag or a key,
 * because a caller who can choose not to encrypt eventually will.
 *
 * Spec section 25 grants that one card is enough for the MVP, so the key is fixed
 * rather than a card id. Multiple cards (v2, section 35) become a keyed variant of
 * exactly these functions.
 */

export const CURRENT_CARD_KEY = 'card:current';

/**
 * JSON is the at-rest encoding, not CBOR.
 *
 * The QR path uses CBOR with integer keys because it is fighting for every byte
 * under a 600-byte budget. On disk there is no such budget, and JSON keeps the
 * stored shape debuggable and the migration story simple. The two encodings are
 * independent on purpose: changing the draft shape must not force a `fmtVersion`
 * bump on the wire format, which is a contract with other installations.
 */
interface StoredCard {
  v: number;
  savedAt: number;
  draft: DraftCard;
}

const STORED_CARD_VERSION = 1;

/**
 * Serialise, encrypt and store.
 *
 * `JSON.stringify` produces a string holding the user's medical details, and a
 * string cannot be wiped -- the same unavoidable leak documented for `<input>`
 * values in secureBytes.ts. It is converted to bytes immediately and those bytes
 * are wiped; the intermediate string is left to the garbage collector because
 * there is no other option in JavaScript.
 */
export async function saveCard(dek: CryptoKey, draft: DraftCard): Promise<void> {
  const stored: StoredCard = {
    v: STORED_CARD_VERSION,
    savedAt: Math.floor(Date.now() / 1000),
    draft,
  };

  const plaintext = utf8(JSON.stringify(stored));
  try {
    const blob = await encryptRecord(dek, STORE.records, CURRENT_CARD_KEY, plaintext);
    await writeRecord(CURRENT_CARD_KEY, blob);
  } finally {
    wipe(plaintext);
  }
}

/**
 * Load and decrypt the stored card, or null if nothing has been saved.
 *
 * Throws `VaultError` on a record that fails authentication -- that is a real
 * signal (wrong key, or tampering) and must not be swallowed into "no card",
 * which would look to the user like their data had silently vanished.
 */
export async function loadCard(dek: CryptoKey): Promise<DraftCard | null> {
  const blob = await readRecord(CURRENT_CARD_KEY);
  if (!blob) return null;

  let plaintext: Bytes | undefined;
  try {
    plaintext = await decryptRecord(dek, STORE.records, CURRENT_CARD_KEY, blob);
    return toDraft(parseStoredCard(plaintext));
  } finally {
    wipe(plaintext);
  }
}

/**
 * Decode authenticated plaintext as JSON.
 *
 * `JSON.parse` was the one fallible call on this path that threw its own error
 * type. Everything else in `loadCard` fails as a `VaultError`, and callers branch
 * on `err instanceof VaultError` to decide what the user sees -- so a raw
 * `SyntaxError` from a truncated record fell through to the generic fallback
 * message instead of the storage one. Reaching here means the GCM tag verified,
 * so malformed JSON is version skew or a half-completed write, not an attack.
 */
function parseStoredCard(plaintext: Bytes): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(plaintext));
  } catch {
    /**
     * The parser's own message is deliberately discarded.
     *
     * It describes the text it choked on, and that text is the decrypted card:
     * JavaScriptCore renders a `JSON.parse` failure as `Unexpected identifier
     * "Jane"`, quoting a token straight out of the user's medical record. That
     * string would then travel wherever a `VaultError.message` travels -- a
     * console, a future error report -- which is precisely the plaintext this
     * module exists to keep inside the encryption boundary. The position of the
     * fault is not worth leaking the contents to learn.
     */
    throw new VaultError('CORRUPT', 'stored card is not valid JSON');
  }
}

export async function clearCard(): Promise<void> {
  await deleteRecord(CURRENT_CARD_KEY);
}

/**
 * Validate the decoded shape before handing it to the UI.
 *
 * Reaching here means the GCM tag verified, so these bytes are authentic and this
 * is not an attacker check -- it is a version-skew check. A card written by a
 * newer build could carry fields this one has never heard of, and the UI must not
 * be handed a half-shaped object. Missing fields are filled with empty strings so
 * the form renders rather than throwing on `undefined.trim()`.
 */
function toDraft(parsed: unknown): DraftCard {
  if (typeof parsed !== 'object' || parsed === null) {
    throw new VaultError('CORRUPT', 'stored card is not an object');
  }
  const record = parsed as Partial<StoredCard>;
  if (record.v !== undefined && record.v > STORED_CARD_VERSION) {
    throw new VaultError('UNSUPPORTED_VERSION', `stored card v${record.v}`);
  }
  const draft = record.draft;
  if (typeof draft !== 'object' || draft === null) {
    throw new VaultError('CORRUPT', 'stored card has no draft');
  }

  const str = (v: unknown): string => (typeof v === 'string' ? v : '');
  const d = draft as Partial<DraftCard>;

  return {
    name: str(d.name),
    preferredName: str(d.preferredName),
    dateOfBirth: str(d.dateOfBirth),
    bloodGroup: str(d.bloodGroup),
    allergies: str(d.allergies),
    medicalConditions: str(d.medicalConditions),
    medications: str(d.medications),
    organDonor: d.organDonor === true,
    preferredHospital: str(d.preferredHospital),
    insurance: str(d.insurance),
    language: str(d.language),
    notes: str(d.notes),
    contacts: Array.isArray(d.contacts)
      ? d.contacts.map((c) => ({
          name: str((c as { name?: unknown } | null)?.name),
          relationship: str((c as { relationship?: unknown } | null)?.relationship),
          phone: str((c as { phone?: unknown } | null)?.phone),
          secondaryPhone: str((c as { secondaryPhone?: unknown } | null)?.secondaryPhone),
        }))
      : [],
  };
}
