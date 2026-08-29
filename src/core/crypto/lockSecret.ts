import { utf8 } from './secureBytes.js';

/**
 * The application lock secret -- security layer 1 (spec section 4).
 *
 * Deliberately a different branded type from `ShareCodeSecret` in shareCode.ts.
 * Section 4 forbids the application PIN from doubling as the QR share code, and a
 * comment saying so is not enforcement: these two brands make the compiler reject
 * passing one where the other is expected. The two secrets protect different
 * things -- this one guards the card at rest on this device, that one guards a
 * card in transit to someone else -- and they must never be interchangeable.
 *
 * Phase 3 adds WebAuthn PRF as the preferred source of the wrapping key. That
 * changes where the bytes come from, not this type: PRF output is a `LockSecret`
 * too, and everything downstream stays the same.
 */
declare const lockSecretBrand: unique symbol;
export type LockSecret = Bytes & { readonly [lockSecretBrand]: true };

/**
 * Normalise an owner-supplied lock passphrase.
 *
 * Trim only. A passphrase is case-sensitive and may legitimately contain spaces
 * in the middle, so the aggressive normalisation that `normalizeShareCode` applies
 * would silently collapse distinct passphrases into one. Trailing whitespace is
 * stripped because it is almost always an accident of copy-paste, and a user who
 * cannot log in because of an invisible trailing space has no way to diagnose it.
 */
export function normalizeLockPassphrase(input: string): LockSecret {
  return utf8(input.trim()) as LockSecret;
}

/** Wrap raw bytes (for example WebAuthn PRF output) as a lock secret. */
export function lockSecretFromBytes(bytes: Bytes): LockSecret {
  return bytes as LockSecret;
}

/**
 * Minimum strength for a lock passphrase.
 *
 * Stricter than `isAcceptablePassphrase` for share codes: this one is the only
 * thing standing between someone holding the unlocked device and every card
 * stored on it, and unlike the share code it is user-chosen rather than generated
 * with 40 bits of entropy behind it.
 */
export const MIN_LOCK_PASSPHRASE_LENGTH = 10;

/**
 * Stems that a length-and-variety rule waves through and an attacker tries first.
 *
 * A composition rule measures the wrong thing: `Password12` satisfies ten
 * characters and two character classes while sitting near the top of every
 * cracking wordlist. Since the only cost imposed on an offline attacker holding
 * the device is Argon2id, a passphrase from a list that short is not protected by
 * the KDF -- it is found in the first seconds.
 *
 * This is a floor, not a strength estimator. It rejects the handful of stems that
 * would otherwise pass, and deliberately does not pretend to score anything else;
 * a real estimator (zxcvbn and its ~45 kB of dictionaries) is a dependency
 * decision for the Phase 3 review, not something to smuggle in here.
 */
const COMMON_STEMS = new Set([
  'password',
  'passwort',
  'passw0rd',
  'qwerty',
  'qwertyuiop',
  'azerty',
  'letmein',
  'welcome',
  'iloveyou',
  'admin',
  'administrator',
  'monkey',
  'dragon',
  'sunshine',
  'princess',
  'football',
  'baseball',
  'trustno',
  'whatever',
  'changeme',
  'secret',
  'safecard',
  'abcdef',
  'abcdefg',
  'abcdefgh',
]);

/**
 * Reduce a passphrase to the stem an attacker's wordlist would hold.
 *
 * Lowercased, with the decorations that satisfy a composition rule stripped:
 * leading and trailing digits and punctuation, and the leetspeak substitutions
 * that let `p@ssw0rd!` masquerade as four character classes.
 */
function stemOf(passphrase: string): string {
  const bare = passphrase
    .toLowerCase()
    // Decoration first, and before the leetspeak pass: a trailing `1` is padding
    // to satisfy a composition rule, not a letter. Substituting before stripping
    // turns `password12` into `passwordi` and the lookup silently never matches.
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '')
    .replace(/^[0-9]+|[0-9]+$/g, '');

  return bare
    .replace(/@/g, 'a')
    .replace(/[$5]/g, 's')
    .replace(/0/g, 'o')
    .replace(/[1!|]/g, 'i')
    .replace(/3/g, 'e')
    .replace(/[^a-z]/g, '');
}

/** Why a passphrase was rejected, or null if it is acceptable. */
export type LockPassphraseProblem = 'too-short' | 'too-uniform' | 'too-common' | 'too-repetitive';

/**
 * Check a candidate lock passphrase, returning the reason it failed.
 *
 * Separate from the boolean below so the UI can say *which* rule was missed. A
 * strength warning the user cannot act on is one they work around by adding `1!`
 * to the end -- which is exactly the passphrase this is trying to prevent.
 */
export function lockPassphraseProblem(input: string): LockPassphraseProblem | null {
  const p = input.trim();
  if (p.length < MIN_LOCK_PASSPHRASE_LENGTH) return 'too-short';

  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((re) => re.test(p)).length;
  // A long passphrase of plain words is strong and has one character class, so
  // the variety rule only applies to short ones. "correct horse battery staple"
  // must not be rejected in favour of "Passw0rd!".
  if (classes < 2 && p.length < 20) return 'too-uniform';

  const stem = stemOf(p);
  if (stem.length > 0 && COMMON_STEMS.has(stem)) return 'too-common';

  // A single repeated character or a run of one digit passes every rule above.
  if (new Set(p).size < 5) return 'too-repetitive';

  return null;
}

export function isAcceptableLockPassphrase(input: string): boolean {
  return lockPassphraseProblem(input) === null;
}
