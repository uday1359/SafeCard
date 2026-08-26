import { useEffect, useState } from 'react';

import { sampleDraft, type DraftCard } from './core/model/draft.js';
import { IconMoon, IconSun, Logo } from './ui/graphics.js';
import { OwnerPanel, type GeneratedQr } from './ui/OwnerPanel.js';
import { RecipientPanel } from './ui/RecipientPanel.js';

type Theme = 'light' | 'dark' | 'system';

/**
 * Phase 0/1 harness.
 *
 * Both sides of the exchange on one page so the core loop can be exercised end to
 * end. The real app splits these into separate routes behind the application lock
 * (Phase 3), and the card comes from local storage rather than component state
 * (Phase 2).
 */
export default function App() {
  const [draft, setDraft] = useState<DraftCard>(sampleDraft);
  const [generated, setGenerated] = useState<GeneratedQr | null>(null);
  const [theme, setTheme] = useState<Theme>('system');

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
  }, [theme]);

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

        <button
          className="btn btn--icon"
          onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        >
          {theme === 'dark' ? <IconSun /> : <IconMoon />}
        </button>
      </header>

      <main className="layout">
        <OwnerPanel draft={draft} onDraftChange={setDraft} onGenerated={setGenerated} />
        <RecipientPanel autofill={generated?.base64} />
      </main>

      <footer className="footnote">
        <p>
          <strong>Phase 0/1 harness.</strong> The application lock, local storage, encrypted backup
          and live camera scanning are not built yet — nothing entered here is saved, and it is
          cleared when you reload.
        </p>
        <p>
          Everything runs on this device. No network request is made after the page loads: the
          Argon2id and QR decoders are served from this origin rather than a CDN, so the app works
          offline once cached.
        </p>
      </footer>
    </div>
  );
}
