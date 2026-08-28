import { useEffect, useMemo, useState } from 'react';

import type { CardPayload } from '../core/crypto/cardPayload.js';
import {
  encodePayload,
  estimatePayloadSize,
  PayloadTooLargeError,
  toBase64Url,
} from '../core/crypto/codec.js';
import { ARGON_DEFAULTS, MAX_PAYLOAD_BYTES } from '../core/crypto/constants.js';
import { formatShareCode, generateShareCode, normalizeShareCode } from '../core/crypto/shareCode.js';
import {
  hasContent,
  SHAREABLE,
  toSharedFields,
  type DraftCard,
  type FieldKey,
} from '../core/model/draft.js';
import { renderQr, type RenderedQr } from '../core/qr/render.js';
import { CardForm } from './CardForm.js';
import { IconCopy, IconDownload, IconLock, IconPrint } from './graphics.js';

const DEFAULT_SELECTED: FieldKey[] = [
  'name',
  'bloodGroup',
  'allergies',
  'medicalConditions',
  'medications',
  'emergencyContacts',
];

export interface GeneratedQr {
  payload: Bytes;
  qr: RenderedQr;
  shareCode: string;
  base64: string;
  elapsedMs: number;
}

export function OwnerPanel({
  draft,
  onDraftChange,
  onGenerated,
}: {
  draft: DraftCard;
  onDraftChange: (d: DraftCard) => void;
  onGenerated: (g: GeneratedQr) => void;
}) {
  const [selected, setSelected] = useState<Set<FieldKey>>(new Set(DEFAULT_SELECTED));
  const [result, setResult] = useState<GeneratedQr | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const fields = useMemo(() => toSharedFields(draft, selected), [draft, selected]);
  const ready = hasContent(fields);

  /**
   * Live size meter.
   *
   * Cheap because AES-GCM is length-preserving, so the exact byte count comes
   * from compression alone -- no key derivation per keystroke. Section 30's limit
   * is otherwise invisible until generation fails.
   */
  useEffect(() => {
    let cancelled = false;
    if (!ready) {
      setEstimate(null);
      return;
    }
    const card: CardPayload = {
      cardId: new Uint8Array(4),
      qrVersion: 1,
      createdAt: 0,
      expiresAt: null,
      fields,
    };
    void estimatePayloadSize(card).then((n) => {
      if (!cancelled) setEstimate(n);
    });
    return () => {
      cancelled = true;
    };
  }, [fields, ready]);

  // Any edit invalidates the QR on screen. Showing a stale code beside changed
  // content is exactly the confusion section 20 warns about.
  useEffect(() => {
    setResult(null);
  }, [fields]);

  const toggle = (key: FieldKey) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const shared = SHAREABLE.filter((f) => selected.has(f.key));
  const notShared = SHAREABLE.filter((f) => !selected.has(f.key));
  const pct = estimate ? Math.min(100, (estimate / MAX_PAYLOAD_BYTES) * 100) : 0;
  const level = pct > 92 ? 'over' : pct > 75 ? 'warn' : 'ok';

  async function generate() {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const card: CardPayload = {
        cardId: crypto.getRandomValues(new Uint8Array(4)),
        qrVersion: 1,
        createdAt: Math.floor(Date.now() / 1000),
        expiresAt: null,
        fields,
      };

      const shareCode = generateShareCode();
      const secret = normalizeShareCode(shareCode);

      const started = performance.now();
      const payload = await encodePayload(card, secret, {
        argon: {
          memKiB: ARGON_DEFAULTS.memKiB,
          time: ARGON_DEFAULTS.time,
          parallelism: ARGON_DEFAULTS.parallelism,
        },
      });
      const elapsedMs = performance.now() - started;

      const generated: GeneratedQr = {
        payload,
        qr: await renderQr(payload, 340),
        shareCode,
        base64: toBase64Url(payload),
        elapsedMs,
      };
      setResult(generated);
      onGenerated(generated);
    } catch (err) {
      setError(
        err instanceof PayloadTooLargeError
          ? err.message
          : `Could not generate the QR code: ${String(err)}`,
      );
    } finally {
      setBusy(false);
    }
  }

  async function copyCode() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(formatShareCode(result.shareCode));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy to the clipboard. Select the code and copy it manually.');
    }
  }

  function downloadQr() {
    if (!result) return;
    const a = document.createElement('a');
    a.href = result.qr.dataUrl;
    a.download = `safecard-${result.shareCode}.png`;
    a.click();
  }

  return (
    <section className="panel" aria-labelledby="owner-heading">
      <header className="panel__head">
        <h2 id="owner-heading">
          <span className="step">1</span> Your emergency card
        </h2>
      </header>

      <CardForm draft={draft} onChange={onDraftChange} />

      <section className="formsection">
        <h3 className="formsection__title">
          <span className="dot dot--share" aria-hidden="true" />
          <span>What to share</span>
        </h3>

        <ul className="checklist">
          {SHAREABLE.map((f) => (
            <li key={f.key}>
              <label className={selected.has(f.key) ? 'chip chip--on' : 'chip'}>
                <input
                  type="checkbox"
                  checked={selected.has(f.key)}
                  onChange={() => toggle(f.key)}
                />
                <span>{f.label}</span>
              </label>
            </li>
          ))}
        </ul>

        {/*
          Section 38, Principle 4 calls the shared / not-shared summary a trust
          feature, so it is a required element rather than a nicety.
        */}
        <div className="summary">
          <div className="summary__col">
            <h4>You are sharing</h4>
            <ul>
              {shared.map((f) => (
                <li key={f.key} className="yes">
                  <span aria-hidden="true">✓</span> {f.label}
                </li>
              ))}
              {!shared.length && <li className="muted">Nothing selected</li>}
            </ul>
          </div>
          <div className="summary__col">
            <h4>Not shared</h4>
            <ul>
              {notShared.map((f) => (
                <li key={f.key} className="no">
                  <span aria-hidden="true">✗</span> {f.label}
                </li>
              ))}
              {!notShared.length && <li className="muted">Everything is shared</li>}
            </ul>
          </div>
        </div>

        <div className={`meter meter--${level}`}>
          <div className="meter__top">
            <span>QR capacity</span>
            <span>
              {estimate ?? 0} / {MAX_PAYLOAD_BYTES} bytes
            </span>
          </div>
          <div
            className="meter__track"
            role="progressbar"
            aria-valuenow={estimate ?? 0}
            aria-valuemin={0}
            aria-valuemax={MAX_PAYLOAD_BYTES}
            aria-label="QR code capacity used"
          >
            <div className="meter__fill" style={{ width: `${pct}%` }} />
          </div>
          <p className="hint">
            {level === 'over'
              ? 'Close to the limit. Shorten the notes or share fewer fields.'
              : 'Photos are never included — a QR cannot reliably carry one.'}
          </p>
        </div>
      </section>

      <button className="btn btn--primary btn--lg" onClick={() => void generate()} disabled={busy || !ready}>
        <IconLock /> {busy ? 'Encrypting…' : 'Generate encrypted QR'}
      </button>

      <p aria-live="polite" className="status">
        {error && <span className="error">{error}</span>}
        {!error && !ready && <span className="muted">Fill in at least one shared field.</span>}
      </p>

      {result && (
        <div className="output">
          <div className="qrframe">
            <img
              className="qr"
              src={result.qr.dataUrl}
              alt={`Encrypted QR code, version ${result.qr.version}`}
              width={340}
              height={340}
            />
          </div>

          <div className="sharecode">
            <h3>Share code</h3>
            <p className="sharecode__value">{formatShareCode(result.shareCode)}</p>
            <div className="rowbtns">
              <button className="btn btn--ghost" onClick={() => void copyCode()}>
                <IconCopy /> {copied ? 'Copied' : 'Copy code'}
              </button>
              <button className="btn btn--ghost" onClick={downloadQr}>
                <IconDownload /> PNG
              </button>
              <button className="btn btn--ghost" onClick={() => window.print()}>
                <IconPrint /> Print
              </button>
            </div>
            <p className="hint">
              The recipient needs this code as well as the QR. It is generated, not chosen: a
              photographed QR can be cracked offline with no rate limit, so a short PIN would give
              almost no protection.
            </p>
          </div>

          <dl className="stats">
            <div>
              <dt>Payload</dt>
              <dd>
                {result.qr.byteLength} B{' '}
                <span className="muted">({MAX_PAYLOAD_BYTES - result.qr.byteLength} spare)</span>
              </dd>
            </div>
            <div>
              <dt>QR symbol</dt>
              <dd>
                v{result.qr.version}{' '}
                <span className="muted">
                  ({result.qr.modules}×{result.qr.modules})
                </span>
              </dd>
            </div>
            <div>
              <dt>Argon2id + AES-256-GCM</dt>
              <dd>{result.elapsedMs.toFixed(0)} ms</dd>
            </div>
          </dl>
        </div>
      )}
    </section>
  );
}
