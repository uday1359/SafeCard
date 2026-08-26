import { describe, expect, it } from 'vitest';

import type { CardPayload } from '../src/core/crypto/cardPayload.js';
import { encodePayload, estimatePayloadSize } from '../src/core/crypto/codec.js';
import { normalizeShareCode } from '../src/core/crypto/shareCode.js';
import {
  emptyDraft,
  initialsOf,
  sampleDraft,
  toSharedFields,
  type FieldKey,
} from '../src/core/model/draft.js';

const all = (...keys: FieldKey[]) => new Set<FieldKey>(keys);

describe('draft to wire conversion', () => {
  it('keeps only the selected fields', () => {
    const out = toSharedFields(sampleDraft(), all('name', 'bloodGroup'));
    expect(out.name).toBe('Aravind Vadayar Krishnan');
    expect(out.bloodGroup).toBe('O+');
    expect(out.allergies).toBeUndefined();
    expect(out.emergencyContacts).toBeUndefined();
    expect(out.notes).toBeUndefined();
  });

  it('splits comma-separated lists and trims them', () => {
    const draft = { ...emptyDraft(), allergies: ' Penicillin ,Peanuts,  ,Shellfish ' };
    const out = toSharedFields(draft, all('allergies'));
    expect(out.allergies).toEqual(['Penicillin', 'Peanuts', 'Shellfish']);
  });

  /**
   * The blood-group dropdown shows a typographic minus for legibility. Letting
   * that reach the wire would hand other readers "O−" instead of "O-", which is
   * the sort of thing that only shows up when a second implementation appears.
   */
  it('normalises the display minus back to ASCII', () => {
    const draft = { ...emptyDraft(), bloodGroup: 'A−' };
    expect(toSharedFields(draft, all('bloodGroup')).bloodGroup).toBe('A-');
  });

  it('omits empty values rather than sending blanks', () => {
    const draft = { ...emptyDraft(), name: '   ', notes: '' };
    const out = toSharedFields(draft, all('name', 'notes', 'allergies'));
    expect(Object.keys(out)).toHaveLength(0);
  });

  it('drops contacts that lack a name or a phone', () => {
    const draft = {
      ...emptyDraft(),
      contacts: [
        { name: 'Ravi Kumar', relationship: 'Brother', phone: '+919876543210', secondaryPhone: '' },
        { name: 'Nameless', relationship: 'Friend', phone: '', secondaryPhone: '' },
        { name: '', relationship: '', phone: '+911234567890', secondaryPhone: '' },
      ],
    };
    const out = toSharedFields(draft, all('emergencyContacts'));
    expect(out.emergencyContacts).toHaveLength(1);
    expect(out.emergencyContacts?.[0]?.name).toBe('Ravi Kumar');
  });

  it('includes a second phone only when one was given', () => {
    const draft = {
      ...emptyDraft(),
      contacts: [
        { name: 'A', relationship: 'B', phone: '+1', secondaryPhone: '' },
        { name: 'C', relationship: 'D', phone: '+2', secondaryPhone: '+3' },
      ],
    };
    const out = toSharedFields(draft, all('emergencyContacts'));
    expect(out.emergencyContacts?.[0]).not.toHaveProperty('secondaryPhone');
    expect(out.emergencyContacts?.[1]?.secondaryPhone).toBe('+3');
  });
});

describe('initials', () => {
  it('derives initials for the avatar', () => {
    expect(initialsOf('Aravind Vadayar Krishnan')).toBe('AK');
    expect(initialsOf('Meera')).toBe('ME');
    expect(initialsOf('  ')).toBe('?');
  });
});

/**
 * The live capacity meter depends on the estimate matching reality exactly. If it
 * drifts, the meter shows green right up until generation fails -- which is worse
 * than having no meter at all.
 */
describe('size estimate', () => {
  it('matches the real encoded length exactly', async () => {
    const card: CardPayload = {
      cardId: Uint8Array.from([1, 2, 3, 4]),
      qrVersion: 1,
      createdAt: 1_756_080_000,
      expiresAt: null,
      fields: toSharedFields(
        sampleDraft(),
        all('name', 'bloodGroup', 'allergies', 'medicalConditions', 'emergencyContacts'),
      ),
    };

    const estimated = await estimatePayloadSize(card);
    const actual = await encodePayload(card, normalizeShareCode('K7F2-QM9X'), {
      argon: { memKiB: 8 * 1024, time: 1, parallelism: 1 },
    });

    expect(estimated).toBe(actual.length);
  }, 30_000);

  it('grows as fields are added', async () => {
    const base = (fields: FieldKey[]): CardPayload => ({
      cardId: Uint8Array.from([1, 2, 3, 4]),
      qrVersion: 1,
      createdAt: 1_756_080_000,
      expiresAt: null,
      fields: toSharedFields(sampleDraft(), new Set(fields)),
    });

    const small = await estimatePayloadSize(base(['name', 'bloodGroup']));
    const large = await estimatePayloadSize(
      base(['name', 'bloodGroup', 'allergies', 'medications', 'emergencyContacts', 'notes']),
    );
    expect(large).toBeGreaterThan(small);
  });
});
