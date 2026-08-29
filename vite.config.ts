import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
// vitest/config re-exports Vite's defineConfig widened with the `test` key. The
// config has to stay a single file: Vitest reads vite.config.ts, and a separate
// vitest.config.ts would silently shadow it, taking the react plugin and the
// CSP plugin's build guard out of the test run.
import { defineConfig } from 'vitest/config';

/**
 * The Content-Security-Policy, injected into the built `index.html`.
 *
 * Static hosting means there is no server to set the header, so the policy has to
 * travel in a meta tag. Three of these directives are load-bearing and the
 * obvious "tighten it" edit breaks the app:
 *
 * - `'wasm-unsafe-eval'` -- WebAssembly instantiation counts as eval under CSP.
 *   Without it neither Argon2id nor the zxing QR reader can start, and unlock
 *   fails with a console error that does not mention CSP.
 * - `img-src data:` -- the generated QR is handed to <img> as a data URL. Drop
 *   this and the owner panel renders a blank box.
 * - `style-src 'unsafe-inline'` -- React sets inline styles for the capacity
 *   meter. Removing it needs those moved to classes first.
 *
 * `connect-src 'self'` is the one that carries the product promise: nothing the
 * page loads can phone home with a decrypted card. `object-src`/`base-uri` are
 * the standard XSS hardening pair, and `form-action 'none'` stops an injected
 * form from POSTing card data anywhere.
 *
 * `frame-ancestors` is deliberately absent: browsers ignore it in a meta tag. If
 * the host can set one real header, make it that one -- it is the clickjacking
 * defence for the unlock screen.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

/**
 * Build-only, and that is not a compromise.
 *
 * The dev server needs a websocket to localhost for HMR and injects inline
 * scripts, both of which a policy this strict blocks -- applying it in dev would
 * force `ws:` and `'unsafe-inline'` into the same string that ships to
 * production. Injecting at build time keeps the shipped policy strict and the
 * dev server working. The cost is that a CSP violation cannot be reproduced with
 * `npm run dev`; use `npm run preview`, which serves the real built output.
 */
function cspPlugin(): Plugin {
  return {
    name: 'safecard-csp',
    apply: 'build',
    transformIndexHtml(html) {
      /**
       * Injected by string replacement rather than Vite's `tags` array, because
       * position matters twice over and `head-prepend` gets one of them wrong.
       *
       * The charset declaration has to fall inside the document's first 1024
       * bytes or the browser stops looking and guesses the encoding; a policy
       * this long placed above it eats a third of that budget for no reason. The
       * CSP itself only has to precede anything that loads a resource, which
       * immediately after the charset satisfies. Both constraints are met by
       * putting it exactly here, and neither is met by "first in head".
       */
      const charset = '<meta charset="UTF-8" />';
      const meta = `<meta http-equiv="Content-Security-Policy" content="${CSP}" />`;
      if (!html.includes(charset)) {
        // Failing the build is right: silently shipping without a CSP is how the
        // policy became documentation-only in the first place.
        throw new Error('safecard-csp: could not find the charset meta tag to anchor the policy');
      }
      return html.replace(charset, `${charset}\n    ${meta}`);
    },
  };
}

export default defineConfig({
  plugins: [react(), cspPlugin()],
  server: {
    port: 5173,
    // Fail loudly rather than silently moving to another port, so the URL in the
    // README is always the one the app is actually on.
    strictPort: true,
    watch: {
      /**
       * Never watch the agent tooling directory.
       *
       * Nothing under `.claude/` is part of the app, so watching it buys nothing
       * -- and on Windows it actively breaks the dev server: a file being written
       * by another process is locked, chokidar's `fs.watch` throws EBUSY, and the
       * FSWatcher error is fatal. The server starts, prints its URL, and dies a
       * moment later.
       */
      ignored: ['**/.claude/**'],
    },
  },
  build: { target: 'es2022' },
  test: {
    /**
     * Node is the default because `src/core/` is dual-target and its tests
     * exercise the Node side on purpose -- the WASM loader takes a different
     * branch there, and that branch is the one CI has to keep working.
     *
     * The UI tests opt into a DOM per file with a `@vitest-environment jsdom`
     * docblock rather than a glob in this config. Vitest 4 removed
     * `environmentMatchGlobs`, and the docblock is better anyway: the
     * requirement sits at the top of the file that has it, so moving a test does
     * not quietly change the environment it runs in.
     */
    environment: 'node',
    setupFiles: ['test/setup.ts'],
    /**
     * Argon2id is the thing under test, not overhead to be mocked away. A
     * create-then-unlock pair pays for two real derivations at the vault cost of
     * 128 MiB, which runs comfortably past the 5 s default on a slow machine.
     */
    testTimeout: 30_000,
  },
});
