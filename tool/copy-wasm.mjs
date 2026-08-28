/**
 * Copy WASM binaries into public/wasm/ so they are served from our own origin.
 *
 * Two reasons this is not optional:
 *
 *  1. Both libraries default to fetching their .wasm from a CDN. The threat model
 *     requires a CSP with no external origins -- a CDN fetch is exactly the kind
 *     of third-party code delivery that Scenario F is about.
 *  2. Served as first-party static assets, they get precached by the service
 *     worker like anything else. If the Argon2 WASM is not cached, unlocking a
 *     card offline fails, and offline operation is the headline requirement.
 */
import { copyFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'wasm');

const assets = [
  ['argon2id/dist/simd.wasm', 'simd.wasm'],
  ['argon2id/dist/no-simd.wasm', 'no-simd.wasm'],
  ['zxing-wasm/reader/zxing_reader.wasm', 'zxing_reader.wasm'],
];

await mkdir(outDir, { recursive: true });

for (const [spec, name] of assets) {
  const src = require.resolve(spec);
  await copyFile(src, join(outDir, name));
  console.log(`  ${name}`);
}

console.log(`\nCopied ${assets.length} WASM binaries to public/wasm/`);
