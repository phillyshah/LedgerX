/**
 * Test runner.
 *
 * The project has no test framework. This bundles tests/index.ts with the
 * esbuild that Vite already depends on, then runs the result in Node — no new
 * dependencies. Tests read files under supabase/functions, so it runs from the
 * repo root and keeps esbuild external so the sync test can call it too.
 *
 *   npm test
 */

import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

// Deliberately inside the repo, not os.tmpdir(): the bundle keeps `esbuild` as
// an external import, and Node resolves bare specifiers by walking up from the
// importing file. From /tmp there is no node_modules to find.
const outDir = join('node_modules', '.cache', 'ledgerx-tests');
const outfile = join(outDir, 'tests.mjs');
mkdirSync(outDir, { recursive: true });

try {
  await build({
    entryPoints: ['tests/index.ts'],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    // esbuild is called at runtime by the edge-function sync test; Node's
    // built-ins must not be inlined either.
    external: ['esbuild'],
    logLevel: 'warning',
  });

  await import(pathToFileURL(outfile).href);
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
