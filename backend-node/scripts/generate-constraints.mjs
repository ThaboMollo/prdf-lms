/**
 * Mirror packages/domain/constraints.ts into backend-node/src.
 *
 *   node scripts/generate-constraints.mjs           # write
 *   node scripts/generate-constraints.mjs --check   # fail if out of date (CI)
 *
 * Why a copy rather than an import: backend-node's tsconfig sets
 * `include: ["src/**\/*"]`, so anything outside src is not compiled and cannot
 * be imported. The frontends consume packages/* directly through Vite; the API
 * cannot. This is the same constraint that already forced a second copy of
 * LOAN_STATUS_TRANSITIONS in applications.service.ts.
 *
 * The difference is that this copy is generated and drift-checked, so the two
 * cannot silently diverge — which is exactly what happened to the validation
 * rules this file exists to unify. A hand-maintained copy would reproduce the
 * original problem one level down.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = path.join(here, '../../packages/domain/constraints.ts');
const TARGET = path.join(here, '../src/common/generated-constraints.ts');

const BANNER = `/**
 * DO NOT EDIT. Generated from packages/domain/constraints.ts.
 *
 * Regenerate with:  node scripts/generate-constraints.mjs
 * CI fails if this file drifts from its source (see the constraint-drift step
 * in .github/workflows/ci-cd.yml).
 *
 * This exists because backend-node's tsconfig \`include: ["src/**\\/*"]\` cannot
 * reach outside src/, so the shared definition has to be mirrored in rather
 * than imported. Editing this copy directly is how the client and server rules
 * drifted apart in the first place — change the source instead.
 */
`;

function render() {
  if (!existsSync(SOURCE)) {
    throw new Error(`Source not found: ${SOURCE}`);
  }

  const source = readFileSync(SOURCE, 'utf8');

  // Strip the source's own module docstring (the leading /** ... */ block); the
  // banner replaces it. Everything after is copied verbatim — the file is plain
  // TypeScript with no imports precisely so this can be a straight copy.
  const body = source.replace(/^\/\*\*[\s\S]*?\*\/\s*/, '');

  if (/^\s*import\s/m.test(body)) {
    throw new Error(
      'packages/domain/constraints.ts has gained an import. It must stay ' +
        'dependency-free so it can be mirrored into backend-node/src verbatim.',
    );
  }

  return BANNER + '\n' + body;
}

const expected = render();
const check = process.argv.includes('--check');
const actual = existsSync(TARGET) ? readFileSync(TARGET, 'utf8') : null;

if (check) {
  if (actual === expected) {
    console.log('ok     | generated-constraints.ts is in sync with packages/domain/constraints.ts');
    process.exit(0);
  }
  console.error(
    actual === null
      ? `NOT OK | ${path.relative(process.cwd(), TARGET)} is missing.`
      : `NOT OK | ${path.relative(process.cwd(), TARGET)} has drifted from packages/domain/constraints.ts.`,
  );
  console.error('         The server would enforce different rules than the client.');
  console.error('         Run: node scripts/generate-constraints.mjs');
  process.exit(1);
}

if (actual === expected) {
  console.log('unchanged');
} else {
  writeFileSync(TARGET, expected);
  console.log(`wrote ${path.relative(process.cwd(), TARGET)}`);
}
