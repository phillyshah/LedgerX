/**
 * A ~30-line test harness.
 *
 * The project had no test runner and no test dependencies. Rather than add a
 * framework for a handful of pure functions, tests register themselves here and
 * `scripts/run-tests.mjs` bundles them with the esbuild that Vite already pulls
 * in. Zero new dependencies.
 *
 * If the suite ever outgrows this — async cases, mocks, watch mode — swap in
 * vitest; it reads the same `test(name, fn)` shape.
 */

interface Registered {
  name: string;
  fn: () => void;
}

const registered: Registered[] = [];

export function test(name: string, fn: () => void): void {
  registered.push({ name, fn });
}

/** Deep-ish equality good enough for strings, numbers, null and undefined. */
export function eq(actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    throw new Error(
      `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

export function runAll(): { passed: number; failed: number } {
  let passed = 0;
  let failed = 0;
  for (const { name, fn } of registered) {
    try {
      fn();
      passed++;
      console.log(`  ✓ ${name}`);
    } catch (err) {
      failed++;
      console.log(`  ✗ ${name}`);
      console.log(`      ${(err as Error).message}`);
    }
  }
  return { passed, failed };
}
