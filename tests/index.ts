/**
 * Test entry point. Importing a test file registers its cases; runAll() then
 * executes them. Add new suites here.
 */

import './ocrYearFix.test';
import './edgeFunctionSync.test';
import './promptAnchor.test';
import { runAll } from './harness';

const { passed, failed } = runAll();
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
