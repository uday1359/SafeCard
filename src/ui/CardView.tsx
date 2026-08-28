import type { CardPayload } from '../core/crypto/cardPayload.js';
import { Avatar, IconPhone } from './graphics.js';

/**
 * The emergency card as a recipient sees it.
 *
 * Section 14 asks for something that reads like a physical emergency card;
 * section 23 wants high contrast and no hunting. The ordering is the design:
 * blood group and allergies sit at the top because those are what a responder
 * needs in the first two seconds, and contacts sit directly under them because
 * calling someone is the most likely next action.
 */
export function CardView({ card }: { card: CardPayload }) {
  const f = card.fields;
  const display = f.preferredName || f.name || 'Emergency card';

  return (
    <article className="ecard" aria-label="Emergency card">
      <header className="ecard__head">
        <span className="ecard__label">EMERGENCY CARD</span>
        <span className="ecard__ver">v{card.qrVersion}</span>
      </header>

      <div className="ecard__id">
        <Avatar name={display} size={58} />
        <div>
          {f.name && <h3 className="ecard__name">{f.name}</h3>}
          <div className="ecard__sub">
            {f.dateOfBirth && <span>Born {f.dateOfBirth}</span>}
            {f.language && <span>{f.language}</span>}
          </div>
        </div>
      </div>

      {(f.bloodGroup || f.allergies?.length) && (
        <div className="ecard__urgent">
          {f.bloodGroup && (
            <div className="urgent">
              <span className="urgent__k">Blood group</span>
              <span className="urgent__v urgent__v--big">{f.bloodGroup}</span>
            </div>
          )}
          {f.allergies?.length ? (
            <div className="urgent">
              {/* The word carries the meaning; section 49 forbids relying on a
                  glyph or colour alone. */}
              <span className="urgent__k">
                <span aria-hidden="true">⚠ </span>Allergies
              </span>
              <span className="urgent__v">{f.allergies.join(', ')}</span>
            </div>
          ) : null}
        </div>
      )}

      {f.emergencyContacts?.length ? (
        <section className="ecard__contacts">
          <h4>Emergency contacts</h4>
          <ul>
            {f.emergencyContacts.map((c, i) => (
              <li key={i}>
                <div className="ec__who">
                  <strong>{c.name}</strong>
                  {c.relationship && <span className="ec__rel">{c.relationship}</span>}
                </div>
                {/* tel: works on mobile browsers and is inert on desktop.
                    Phase 5 hides it rather than showing a dead control. */}
                <a className="btn btn--call" href={`tel:${c.phone.replace(/\s/g, '')}`}>
                  <IconPhone /> {c.phone}
                </a>
                {c.secondaryPhone && (
                  <a
                    className="btn btn--call btn--call2"
                    href={`tel:${c.secondaryPhone.replace(/\s/g, '')}`}
                  >
                    <IconPhone /> {c.secondaryPhone}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <dl className="ecard__rows">
        {f.medicalConditions?.length ? (
          <Row k="Conditions" v={f.medicalConditions.join(', ')} />
        ) : null}
        {f.medications?.length ? <Row k="Medications" v={f.medications.join(', ')} /> : null}
        {f.organDonor !== undefined && <Row k="Organ donor" v={f.organDonor ? 'Yes' : 'No'} />}
        {f.preferredHospital && <Row k="Preferred hospital" v={f.preferredHospital} />}
        {f.insurance && <Row k="Insurance" v={f.insurance} />}
        {f.notes && <Row k="Notes" v={f.notes} />}
      </dl>

      <footer className="ecard__foot">
        Emergency information is provided by the card owner. Always verify critical information when
        possible. SafeCard does not replace official medical records or emergency services.
      </footer>
    </article>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="ecard__row">
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}
