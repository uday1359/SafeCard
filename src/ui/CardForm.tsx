import {
  BLOOD_GROUPS,
  emptyContact,
  type DraftCard,
  type DraftContact,
} from '../core/model/draft.js';
import { Avatar, IconPlus, IconTrash } from './graphics.js';

/**
 * The card editor.
 *
 * One scrolling form in labelled sections rather than the six-step wizard of
 * section 13. Same fields, same order, but the whole card stays visible -- which
 * matters because the field-sharing choice further down is about this content,
 * and section 39 targets a first card in two to five minutes.
 *
 * Every input has a real <label>. Placeholder-as-label is the most common way
 * accessibility promises quietly break, and sections 24 and 49 make screen-reader
 * support a hard requirement.
 */
export function CardForm({
  draft,
  onChange,
}: {
  draft: DraftCard;
  onChange: (next: DraftCard) => void;
}) {
  const set = <K extends keyof DraftCard>(key: K, value: DraftCard[K]) =>
    onChange({ ...draft, [key]: value });

  const setContact = (i: number, patch: Partial<DraftContact>) => {
    const contacts = draft.contacts.map((c, j) => (j === i ? { ...c, ...patch } : c));
    onChange({ ...draft, contacts });
  };

  return (
    <div className="form">
      <section className="formsection">
        <h3 className="formsection__title">
          <Avatar name={draft.name || '?'} size={44} />
          <span>Identity</span>
        </h3>

        <div className="grid2">
          <label className="field">
            <span>Full name</span>
            <input
              value={draft.name}
              onChange={(e) => set('name', e.target.value)}
              autoComplete="name"
              placeholder="e.g. Aravind Vadayar Krishnan"
            />
          </label>

          <label className="field">
            <span>
              Preferred name <em>optional</em>
            </span>
            <input
              value={draft.preferredName}
              onChange={(e) => set('preferredName', e.target.value)}
              placeholder="e.g. Aravind"
            />
          </label>

          <label className="field">
            <span>Date of birth</span>
            <input
              type="date"
              value={draft.dateOfBirth}
              onChange={(e) => set('dateOfBirth', e.target.value)}
            />
          </label>

          <label className="field">
            <span>
              Language <em>optional</em>
            </span>
            <input
              value={draft.language}
              onChange={(e) => set('language', e.target.value)}
              placeholder="e.g. English, Tamil"
            />
          </label>
        </div>
      </section>

      <section className="formsection">
        <h3 className="formsection__title">
          <span className="dot dot--medical" aria-hidden="true" />
          <span>Medical</span>
        </h3>
        {/* Section 8 requires this be clearly optional and clearly not a
            substitute for real medical records. */}
        <p className="note">
          Every medical field is optional. SafeCard is an information-sharing tool and does not
          replace official medical records.
        </p>

        <div className="grid2">
          <label className="field">
            <span>Blood group</span>
            <select value={draft.bloodGroup} onChange={(e) => set('bloodGroup', e.target.value)}>
              <option value="">Not specified</option>
              {BLOOD_GROUPS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>

          <label className="field field--check">
            <input
              type="checkbox"
              checked={draft.organDonor}
              onChange={(e) => set('organDonor', e.target.checked)}
            />
            <span>Registered organ donor</span>
          </label>
        </div>

        <label className="field">
          <span>
            Allergies <em>separate with commas</em>
          </span>
          <input
            value={draft.allergies}
            onChange={(e) => set('allergies', e.target.value)}
            placeholder="e.g. Penicillin, Peanuts"
          />
        </label>

        <label className="field">
          <span>
            Medical conditions <em>separate with commas</em>
          </span>
          <input
            value={draft.medicalConditions}
            onChange={(e) => set('medicalConditions', e.target.value)}
            placeholder="e.g. Type 1 diabetes, Asthma"
          />
        </label>

        <label className="field">
          <span>
            Medications <em>separate with commas</em>
          </span>
          <input
            value={draft.medications}
            onChange={(e) => set('medications', e.target.value)}
            placeholder="e.g. Insulin glargine 20u nightly"
          />
        </label>
      </section>

      <section className="formsection">
        <h3 className="formsection__title">
          <span className="dot dot--contacts" aria-hidden="true" />
          <span>Emergency contacts</span>
        </h3>

        <ul className="contactlist">
          {draft.contacts.map((c, i) => (
            <li key={i} className="contactrow">
              <div className="contactrow__head">
                <span className="contactrow__n">Contact {i + 1}</span>
                <button
                  type="button"
                  className="btn btn--icon btn--danger"
                  onClick={() =>
                    onChange({ ...draft, contacts: draft.contacts.filter((_, j) => j !== i) })
                  }
                  disabled={draft.contacts.length === 1}
                  aria-label={`Remove contact ${i + 1}`}
                >
                  <IconTrash />
                </button>
              </div>

              <div className="grid2">
                <label className="field">
                  <span>Name</span>
                  <input
                    value={c.name}
                    onChange={(e) => setContact(i, { name: e.target.value })}
                    placeholder="e.g. Ravi Kumar"
                  />
                </label>
                <label className="field">
                  <span>Relationship</span>
                  <input
                    value={c.relationship}
                    onChange={(e) => setContact(i, { relationship: e.target.value })}
                    placeholder="e.g. Brother"
                  />
                </label>
                <label className="field">
                  <span>Phone</span>
                  <input
                    type="tel"
                    value={c.phone}
                    onChange={(e) => setContact(i, { phone: e.target.value })}
                    placeholder="+91 98765 43210"
                  />
                </label>
                <label className="field">
                  <span>
                    Second phone <em>optional</em>
                  </span>
                  <input
                    type="tel"
                    value={c.secondaryPhone}
                    onChange={(e) => setContact(i, { secondaryPhone: e.target.value })}
                  />
                </label>
              </div>
            </li>
          ))}
        </ul>

        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => onChange({ ...draft, contacts: [...draft.contacts, emptyContact()] })}
        >
          <IconPlus /> Add another contact
        </button>
      </section>

      <section className="formsection">
        <h3 className="formsection__title">
          <span className="dot dot--other" aria-hidden="true" />
          <span>Additional information</span>
        </h3>

        <div className="grid2">
          <label className="field">
            <span>Preferred hospital</span>
            <input
              value={draft.preferredHospital}
              onChange={(e) => set('preferredHospital', e.target.value)}
              placeholder="e.g. Apollo Hospital, Chennai"
            />
          </label>
          <label className="field">
            <span>Insurance</span>
            <input
              value={draft.insurance}
              onChange={(e) => set('insurance', e.target.value)}
              placeholder="Provider and policy reference"
            />
          </label>
        </div>

        <label className="field">
          <span>Emergency notes</span>
          <textarea
            rows={2}
            value={draft.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="Anything a responder should know first"
          />
        </label>
      </section>
    </div>
  );
}
