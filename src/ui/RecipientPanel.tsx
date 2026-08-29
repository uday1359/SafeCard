import { useEffect, useRef, useState } from 'react';

import type { CardPayload } from '../core/crypto/cardPayload.js';
import { decodePayload, fromBase64Url, toBase64Url } from '../core/crypto/codec.js';
import { DecodeError } from '../core/crypto/errors.js';
import { formatShareCode, normalizeShareCode } from '../core/crypto/shareCode.js';
import { decodeQrImage } from '../core/qr/decode.js';
import { CardView } from './CardView.js';
import { IconLock, IconScan, IconUpload } from './graphics.js';

/**
 * The recipient side: obtain the payload, then unlock it.
 *
 * Live camera scanning is Phase 5. What is here covers every desktop path --
 * drop, browse, or paste an image, plus the text channel -- through one decoder.
 * In the native plan those paths needed an entire separate Windows workstream.
 */
export function RecipientPanel({ autofill }: { autofill?: string }) {
  const [payloadText, setPayloadText] = useState('');
  const [code, setCode] = useState('');
  const [card, setCard] = useState<CardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  /**
   * Mirror a freshly generated payload into the textarea.
   *
   * The harness puts both sides of the exchange on one page so the loop can be
   * exercised on a single machine (App.tsx), and this is what was meant to make
   * that work. Without it the prop was accepted and dropped: the payload never
   * arrived, the placeholder claimed the opposite of what was happening, and the
   * README documented an autofill that did not exist.
   *
   * Only the payload crosses. The share code deliberately does not -- a
   * recipient has to obtain that through the other channel, and a harness that
   * filled it in for them would be demonstrating a loop the real product does
   * not have.
   *
   * Regenerating clears any card already on screen, for the same reason
   * OwnerPanel drops its QR on an edit: a decoded card shown beside a payload it
   * did not come from is exactly the confusion section 20 warns about.
   */
  useEffect(() => {
    if (!autofill) return;
    setPayloadText(autofill);
    setCard(null);
    setError(null);
    setSource(null);
  }, [autofill]);

  async function loadImage(file: File | Blob, label: string) {
    setError(null);
    setCard(null);
    try {
      const bytes = await decodeQrImage(file);
      if (!bytes) {
        setError('No QR code was found in that image.');
        return;
      }
      setPayloadText(toBase64Url(bytes));
      setSource(`Read ${bytes.length} bytes from ${label}`);
    } catch (err) {
      setError(`Could not read that image: ${String(err)}`);
    }
  }

  /** Paste a screenshot straight in -- the most natural desktop gesture. */
  function onPaste(e: React.ClipboardEvent) {
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith('image/'));
    const blob = item?.getAsFile();
    if (blob) {
      e.preventDefault();
      void loadImage(blob, 'the pasted image');
    }
  }

  async function unlock() {
    setBusy(true);
    setError(null);
    setCard(null);
    try {
      const payload = fromBase64Url(payloadText);
      const secret = normalizeShareCode(code);
      setCard(await decodePayload(payload, secret));
    } catch (err) {
      // Only userMessage reaches the screen. DecodeError keeps developer detail
      // in .message, which must never surface -- section 18 requires a wrong code
      // and a tampered payload to be indistinguishable.
      setError(err instanceof DecodeError ? err.userMessage : 'The QR code could not be read.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="recipient-heading" onPaste={onPaste}>
      <header className="panel__head">
        <h2 id="recipient-heading">
          <span className="step">2</span> Scan and unlock
        </h2>
      </header>

      <div
        className={dragging ? 'dropzone dropzone--over' : 'dropzone'}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) void loadImage(file, file.name);
        }}
      >
        <span className="dropzone__icon" aria-hidden="true">
          <IconScan size={30} />
        </span>
        <p className="dropzone__title">Drop a QR image, or paste a screenshot</p>
        <button className="btn btn--ghost" onClick={() => fileRef.current?.click()}>
          <IconUpload /> Choose an image
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="visually-hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void loadImage(file, file.name);
          }}
        />
        {source && <p className="hint hint--ok">{source}</p>}
        <p className="hint">Live camera scanning arrives in Phase 5.</p>
      </div>

      <details className="advanced">
        <summary>Or paste the payload text</summary>
        <label className="field">
          <span className="visually-hidden">Payload text</span>
          <textarea
            value={payloadText}
            onChange={(e) => setPayloadText(e.target.value)}
            rows={3}
            spellCheck={false}
            placeholder="U0MB…"
          />
        </label>
      </details>

      <label className="field">
        <span>Share code</span>
        <input
          className="codeinput"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onBlur={() => setCode((c) => (c.trim() ? formatShareCode(c) : c))}
          placeholder="K7F2-QM9X"
          autoComplete="off"
          spellCheck={false}
          inputMode="text"
        />
      </label>

      <button
        className="btn btn--primary btn--lg"
        onClick={() => void unlock()}
        disabled={busy || !payloadText || !code}
      >
        <IconLock /> {busy ? 'Unlocking…' : 'Unlock card'}
      </button>

      {/* aria-live so a screen reader announces the outcome without a focus jump. */}
      <p aria-live="polite" className="status">
        {error && <span className="error">{error}</span>}
        {card && <span className="ok">Card unlocked</span>}
      </p>

      {card && <CardView card={card} />}
    </section>
  );
}
