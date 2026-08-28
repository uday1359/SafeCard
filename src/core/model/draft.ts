import type { SharedFields } from '../crypto/cardPayload.js';

/**
 * The card as the owner edits it.
 *
 * Distinct from SharedFields on purpose. This is UI shape -- everything is a
 * string because that is what an <input> gives you, and list fields are held as
 * raw comma-separated text so a half-typed entry does not vanish mid-keystroke.
 * The conversion to wire shape happens in one place, on generate.
 */
export interface DraftContact {
  name: string;
  relationship: string;
  phone: string;
  secondaryPhone: string;
}

export interface DraftCard {
  name: string;
  preferredName: string;
  dateOfBirth: string;
  bloodGroup: string;
  allergies: string;
  medicalConditions: string;
  medications: string;
  organDonor: boolean;
  preferredHospital: string;
  insurance: string;
  language: string;
  notes: string;
  contacts: DraftContact[];
}

export const BLOOD_GROUPS = ['A+', 'A−', 'B+', 'B−', 'AB+', 'AB−', 'O+', 'O−'] as const;

export function emptyContact(): DraftContact {
  return { name: '', relationship: '', phone: '', secondaryPhone: '' };
}

export function emptyDraft(): DraftCard {
  return {
    name: '',
    preferredName: '',
    dateOfBirth: '',
    bloodGroup: '',
    allergies: '',
    medicalConditions: '',
    medications: '',
    organDonor: false,
    preferredHospital: '',
    insurance: '',
    language: '',
    notes: '',
    contacts: [emptyContact()],
  };
}

/** Prefills the form so the app can be tried without inventing medical details. */
export function sampleDraft(): DraftCard {
  return {
    name: 'Aravind Vadayar Krishnan',
    preferredName: 'Aravind',
    dateOfBirth: '1991-04-17',
    bloodGroup: 'O+',
    allergies: 'Penicillin, Peanuts',
    medicalConditions: 'Type 1 diabetes, Asthma',
    medications: 'Insulin glargine 20u nightly, Salbutamol inhaler',
    organDonor: true,
    preferredHospital: 'Apollo Hospital, Chennai',
    insurance: 'Star Health P/191234/01/2026/004521',
    language: 'English, Tamil',
    notes: 'Carries an insulin pen in the left jacket pocket.',
    contacts: [
      { name: 'Ravi Kumar', relationship: 'Brother', phone: '+91 98765 43210', secondaryPhone: '' },
      { name: 'Meera Nair', relationship: 'Mother', phone: '+91 98123 45678', secondaryPhone: '' },
    ],
  };
}

export type FieldKey =
  | 'name'
  | 'dateOfBirth'
  | 'bloodGroup'
  | 'allergies'
  | 'medicalConditions'
  | 'medications'
  | 'emergencyContacts'
  | 'organDonor'
  | 'preferredHospital'
  | 'insurance'
  | 'language'
  | 'notes';

export const SHAREABLE: { key: FieldKey; label: string; group: string }[] = [
  { key: 'name', label: 'Name', group: 'Identity' },
  { key: 'dateOfBirth', label: 'Date of birth', group: 'Identity' },
  { key: 'bloodGroup', label: 'Blood group', group: 'Medical' },
  { key: 'allergies', label: 'Allergies', group: 'Medical' },
  { key: 'medicalConditions', label: 'Conditions', group: 'Medical' },
  { key: 'medications', label: 'Medications', group: 'Medical' },
  { key: 'organDonor', label: 'Organ donor', group: 'Medical' },
  { key: 'emergencyContacts', label: 'Emergency contacts', group: 'Contacts' },
  { key: 'preferredHospital', label: 'Preferred hospital', group: 'Other' },
  { key: 'insurance', label: 'Insurance', group: 'Other' },
  { key: 'language', label: 'Language', group: 'Other' },
  { key: 'notes', label: 'Notes', group: 'Other' },
];

function splitList(text: string): string[] {
  return text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Project the draft onto the wire shape, keeping only the selected fields.
 *
 * Empty values are dropped rather than sent as empty strings -- section 30's
 * budget is tight enough that empty keys are not free, and an absent field is
 * more honest than a blank one.
 */
export function toSharedFields(draft: DraftCard, selected: Set<FieldKey>): SharedFields {
  const out: SharedFields = {};

  if (selected.has('name') && draft.name.trim()) out.name = draft.name.trim();
  if (selected.has('dateOfBirth') && draft.dateOfBirth) out.dateOfBirth = draft.dateOfBirth;
  if (selected.has('bloodGroup') && draft.bloodGroup) {
    // The display uses a typographic minus for legibility; normalise it back to
    // ASCII so the wire format stays plain and other readers are not surprised.
    out.bloodGroup = draft.bloodGroup.replace('−', '-');
  }
  if (selected.has('allergies')) {
    const v = splitList(draft.allergies);
    if (v.length) out.allergies = v;
  }
  if (selected.has('medicalConditions')) {
    const v = splitList(draft.medicalConditions);
    if (v.length) out.medicalConditions = v;
  }
  if (selected.has('medications')) {
    const v = splitList(draft.medications);
    if (v.length) out.medications = v;
  }
  if (selected.has('organDonor') && draft.organDonor) out.organDonor = true;
  if (selected.has('preferredHospital') && draft.preferredHospital.trim()) {
    out.preferredHospital = draft.preferredHospital.trim();
  }
  if (selected.has('insurance') && draft.insurance.trim()) out.insurance = draft.insurance.trim();
  if (selected.has('language') && draft.language.trim()) out.language = draft.language.trim();
  if (selected.has('notes') && draft.notes.trim()) out.notes = draft.notes.trim();

  if (selected.has('emergencyContacts')) {
    const contacts = draft.contacts
      .filter((c) => c.name.trim() && c.phone.trim())
      .map((c) => ({
        name: c.name.trim(),
        relationship: c.relationship.trim(),
        phone: c.phone.trim(),
        ...(c.secondaryPhone.trim() ? { secondaryPhone: c.secondaryPhone.trim() } : {}),
      }));
    if (contacts.length) out.emergencyContacts = contacts;
  }

  return out;
}

/** Does the draft have enough in it to be worth sharing at all? */
export function hasContent(fields: SharedFields): boolean {
  return Object.keys(fields).length > 0;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}
