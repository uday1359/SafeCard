import { useEffect, useRef, useState } from 'react';

import { sampleDraft, type DraftCard } from './core/model/draft.js';
import { loadCard, saveCard } from './core/store/cardRepository.js';
import { IconLock, IconMoon, IconSun, Logo } from './ui/graphics.js';
import { LockPanel } from './ui/LockPanel.js';
import { OwnerPanel, type GeneratedQr } from './ui/OwnerPanel.js';
import { RecipientPanel } from './ui/RecipientPanel.js';
import { useVault } from './ui/useVault.js';

type Theme = 'light' | 'dark' | 'system';

/** How long to wait after the last keystroke before writing to IndexedDB. */
const AUTOSAVE_DELAY_MS = 800;

/**
 * Phase 0/1/2 harness.
 *
 * Owner and recipient sit side by side on one page so the core loop can be
 * exercised end to end. The real app splits these into separate routes (Phase 4
 * and 5); what is real here is the storage layer beneath them -- the card is
 * encrypted at rest and survives a reload.
 */
export default function App() {
  const vault = useVault();
  const [draft, setDraft] = useState<DraftCard>(sampleDraft);
  const [generated, setGenerated] = useState<GeneratedQr | null>(null);
  const [theme, setTheme] = useState<Theme>('system');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  /**
   * Whether the stored card has been read back yet.
   *
   * Autosave must not run before this is true. Unlocking sets the DEK, which wakes
   * the autosave effect while `draft` is still the sample card -- if the read from
   * IndexedDB were slower than the debounce, that sample would be written over the
   * user's real card. Gating on hydration removes the race rather than relying on
   * the read winning.
   */
  const [hydrated, setHydrated] = useState(false);

  /** Suppresses the autosave that the load itself would otherwise trigger. */
  const justLoaded = useRef(false);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
  }, [theme]);

  /**
   * Locking must drop the plaintext, not just the key.
   *
   * Clearing the DEK alone would leave the decrypted card -- and the generated
   * share code, which is a live secret -- sitting in component state. On a
   * backgrounded tab that memory stays fully resident (build-plan section 2.3),
   * so a lock that keeps the data around protects nothing. These are strings and
   * cannot be wiped; dropping every reference is the most JavaScript allows.
   */
  useEffect(() => {
    if (vault.status === 'unlocked') return;
    setDraft(sampleDraft());
    setGenerated(null);
    setSaveState('idle');
    setHydrated(false);
  }, [vault.status]);

  // Load the stored card the moment the vault opens.
  useEffect(() => {
    const dek = vault.dek;
    if (!dek) return;
    let cancelled = false;
    void loadCard(dek)
      .then((stored) => {
        if (cancelled) return;
        justLoaded.current = true;
        // No stored card means this is a first run; the sample draft stays so the
        // app is explorable rather than an empty form.
        if (stored) setDraft(stored);
        setHydrated(true);
      })
      .catch(() => {
        if (cancelled) return;
        // Do NOT hydrate on failure. A card that exists but could not be read
        // must never be silently replaced by whatever is on screen.
        setSaveState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [vault.dek]);

  // Autosave, debounced. Writing on every keystroke would re-encrypt the whole
  // card dozens of times a sentence; the DEK is already in memory so this is
  // cheap, but IndexedDB writes are not free.
  useEffect(() => {
    const dek = vault.dek;
    if (!dek || !hydrated) return;
    if (justLoaded.current) {
      justLoaded.current = false;
      return;
    }
    setSaveState('saving');
    const timer = setTimeout(() => {
      void saveCard(dek, draft)
        .then(() => setSaveState('saved'))
        .catch(() => setSaveState('error'));
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [draft, vault.dek, hydrated]);

  const unlocked = vault.status === 'unlocked';

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar__brand">
          <Logo />
          <div>
            <h1>SafeCard</h1>
            <p>Emergency information, available when it matters.</p>
          </div>
        </div>

        <div className="topbar__actions">
          {unlocked && (
            <>
              <span className="savestate" aria-live="polite">
                {saveState === 'saving' && 'Saving…'}
                {saveState === 'saved' && 'Saved on this device'}
                {saveState === 'error' && 'Could not save'}
              </span>
              <button className="btn btn--ghost" onClick={vault.lock}>
                <IconLock />
                Lock
              </button>
            </>
          )}
          <button
            className="btn btn--icon"
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {theme === 'dark' ? <IconSun /> : <IconMoon />}
          </button>
        </div>
      </header>

      {vault.status === 'checking' ? (
        <main className="layout layout--single">
          <p className="lock__note">Opening secure storage…</p>
        </main>
      ) : vault.status === 'unavailable' ? (
        <main className="layout layout--single">
          {/*
            A dead end on purpose. We could not read the database, so we cannot
            tell whether a vault exists -- and offering to create one here would
            let a user with an existing vault overwrite it with a new key and
            lose every stored card. Explaining the situation is the safe move.
          */}
          <section className="panel panel--lock">
            <div className="panel__head">
              <IconLock />
              <h2>Storage unavailable</h2>
            </div>
            <p className="lock__intro" role="alert">
              SafeCard could not open its encrypted storage in this browser, so it cannot tell
              whether a card is already saved here. Nothing has been changed or deleted.
            </p>
            <p className="lock__note">
              Private or incognito windows block this in some browsers, and so does clearing site
              data mid-session. Try a normal window, or reload the page. If you already had a card
              saved on this device, do not create a new one somewhere else until this works — your
              data is still here.
            </p>
          </section>
        </main>
      ) : unlocked ? (
        <main className="layout">
          <OwnerPanel draft={draft} onDraftChange={setDraft} onGenerated={setGenerated} />
          <RecipientPanel autofill={generated?.base64} />
        </main>
      ) : (
        <main className="layout layout--single">
          <LockPanel vault={vault} />
        </main>
      )}

      <footer className="footnote">
        <p>
          <strong>Phase 0–2 harness.</strong> Your card is now encrypted and stored on this device,
          so it survives a reload. Encrypted backup export, photo storage, live camera scanning and
          passkey unlock are not built yet.
        </p>
        {unlocked && !vault.persisted && (
          <p>
            The browser has not granted persistent storage, so it may evict this data if the device
            runs low on space. Encrypted backup export is the fix, and it is not built yet — treat
            this as a demo, not as your only copy.
          </p>
        )}
        <p>
          Everything runs on this device. No request leaves this origin: the Argon2id and QR
          decoders are fetched from here rather than a CDN, and the page's Content-Security-Policy
          blocks connections anywhere else, so the app works offline once cached.
        </p>
      </footer>
    </div>
  );
}
