import { Encoder } from 'cbor-x';

/**
 * CBOR encoding of the shared card.
 *
 * Integer keys, and absent fields omitted entirely. That is where the size saving
 * lives, and it is what makes the owner's field selection (spec sections 9 and 38)
 * translate directly into a smaller QR.
 */

/** Top-level keys. */
export const K = {
  cardId: 1,
  qrVersion: 2,
  createdAt: 3,
  expiresAt: 4,
  fields: 5,
} as const;

/** Keys inside the `fields` map. */
export const F = {
  name: 10,
  preferredName: 11,
  dateOfBirth: 12,
  bloodGroup: 13,
  allergies: 14,
  medicalConditions: 15,
  medications: 16,
  notes: 17,
  emergencyContacts: 18,
  preferredHospital: 19,
  insurance: 20,
  language: 21,
  organDonor: 22,
  doctor: 23,
} as const;

export interface EmergencyContact {
  name: string;
  relationship: string;
  phone: string;
  secondaryPhone?: string;
}

export interface SharedFields {
  name?: string;
  preferredName?: string;
  dateOfBirth?: string;
  bloodGroup?: string;
  allergies?: string[];
  medicalConditions?: string[];
  medications?: string[];
  notes?: string;
  emergencyContacts?: EmergencyContact[];
  preferredHospital?: string;
  insurance?: string;
  language?: string;
  organDonor?: boolean;
  doctor?: [string, string];
}

export interface CardPayload {
  cardId: Bytes;
  qrVersion: number;
  createdAt: number;
  expiresAt: number | null;
  fields: SharedFields;
}

/**
 * Standard CBOR only.
 *
 * `useRecords` must stay false: cbor-x's record extension is a non-standard
 * optimisation, and this payload is a wire format that other implementations have
 * to parse. `mapsAsObjects: false` keeps integer keys as integers on decode
 * instead of coercing them to strings.
 */
const codec = new Encoder({
  useRecords: false,
  mapsAsObjects: false,
  tagUint8Array: false,
  variableMapSize: true,
});

function setIf<T>(map: Map<number, unknown>, key: number, value: T | undefined | null): void {
  if (value === undefined || value === null) return;
  if (Array.isArray(value) && value.length === 0) return;
  if (typeof value === 'string' && value.length === 0) return;
  map.set(key, value);
}

export function encodeCard(card: CardPayload): Bytes {
  const fields = new Map<number, unknown>();
  const f = card.fields;

  setIf(fields, F.name, f.name);
  setIf(fields, F.preferredName, f.preferredName);
  setIf(fields, F.dateOfBirth, f.dateOfBirth);
  setIf(fields, F.bloodGroup, f.bloodGroup);
  setIf(fields, F.allergies, f.allergies);
  setIf(fields, F.medicalConditions, f.medicalConditions);
  setIf(fields, F.medications, f.medications);
  setIf(fields, F.notes, f.notes);
  setIf(
    fields,
    F.emergencyContacts,
    f.emergencyContacts?.map((c) =>
      c.secondaryPhone
        ? [c.name, c.relationship, c.phone, c.secondaryPhone]
        : [c.name, c.relationship, c.phone],
    ),
  );
  setIf(fields, F.preferredHospital, f.preferredHospital);
  setIf(fields, F.insurance, f.insurance);
  setIf(fields, F.language, f.language);
  if (f.organDonor !== undefined) fields.set(F.organDonor, f.organDonor);
  setIf(fields, F.doctor, f.doctor);

  const root = new Map<number, unknown>();
  root.set(K.cardId, card.cardId);
  root.set(K.qrVersion, card.qrVersion);
  root.set(K.createdAt, card.createdAt);
  if (card.expiresAt !== null) root.set(K.expiresAt, card.expiresAt);
  root.set(K.fields, fields);

  // Copy out of cbor-x's reusable internal buffer. Returning its view directly
  // would alias a buffer that the next encode() call overwrites -- and that
  // buffer would still hold this card's plaintext in the meantime.
  const encoded = codec.encode(root);
  const out = new Uint8Array(encoded.length);
  out.set(encoded);
  return out;
}

export function decodeCard(bytes: Bytes): CardPayload {
  const root = codec.decode(bytes) as Map<number, unknown>;
  if (!(root instanceof Map)) throw new Error('payload root is not a CBOR map');

  const rawFields = root.get(K.fields);
  const fm = rawFields instanceof Map ? (rawFields as Map<number, unknown>) : new Map();

  const contacts = fm.get(F.emergencyContacts) as unknown[][] | undefined;

  // Unknown keys are ignored rather than rejected, so a v1 reader keeps working
  // when a newer build adds optional fields within the same format version.
  return {
    // Copied, not aliased. CBOR byte strings decode to views over the input
    // buffer, and the caller wipes that buffer as soon as decoding returns -- so
    // a view here would be silently zeroed out from under the caller. Text
    // fields are unaffected because they decode into fresh JS strings.
    cardId: (root.get(K.cardId) as Bytes).slice(),
    qrVersion: root.get(K.qrVersion) as number,
    createdAt: root.get(K.createdAt) as number,
    expiresAt: (root.get(K.expiresAt) as number | undefined) ?? null,
    fields: {
      name: fm.get(F.name) as string | undefined,
      preferredName: fm.get(F.preferredName) as string | undefined,
      dateOfBirth: fm.get(F.dateOfBirth) as string | undefined,
      bloodGroup: fm.get(F.bloodGroup) as string | undefined,
      allergies: fm.get(F.allergies) as string[] | undefined,
      medicalConditions: fm.get(F.medicalConditions) as string[] | undefined,
      medications: fm.get(F.medications) as string[] | undefined,
      notes: fm.get(F.notes) as string | undefined,
      emergencyContacts: contacts?.map((c) => ({
        name: c[0] as string,
        relationship: c[1] as string,
        phone: c[2] as string,
        secondaryPhone: c[3] as string | undefined,
      })),
      preferredHospital: fm.get(F.preferredHospital) as string | undefined,
      insurance: fm.get(F.insurance) as string | undefined,
      language: fm.get(F.language) as string | undefined,
      organDonor: fm.get(F.organDonor) as boolean | undefined,
      doctor: fm.get(F.doctor) as [string, string] | undefined,
    },
  };
}
