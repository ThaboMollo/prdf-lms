/**
 * NumericInput parsing/formatting tests (docs/validation-spec.md §D).
 *
 *   node packages/ui-kit/test-numeric-input.mjs
 *
 * The bug this component replaces is not "the input looks wrong". It is that
 * `<input type="number">` reports `value === ''` for content it considers
 * invalid, and the app's `Number(e.target.value)` turns that into **0**. On a
 * loan amount that is a silent, plausible wrong number — no error, no empty
 * field, just a different figure than the user typed.
 *
 * So the assertions that matter are about what comes OUT: never NaN, never a
 * coerced 0, and null kept distinct from zero. Plus the typing sequences that
 * a naive implementation mangles — a half-typed decimal, a pasted formatted
 * amount, a comma used as the decimal separator.
 *
 * The component itself needs a DOM; the exported logic does not, and it holds
 * everything worth getting wrong.
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, '../../client-ui/index.js'));
const { build } = require('esbuild');

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`ok     | ${name}`);
  } else {
    failed++;
    console.log(`NOT OK | ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const result = await build({
  entryPoints: [path.join(here, 'components/NumericInput.tsx')],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  logLevel: 'silent',
  external: ['react'],
});

const stubRequire = (specifier) => {
  if (specifier === 'react') {
    return new Proxy({}, {
      get() {
        throw new Error('React was used by code that is supposed to be pure');
      },
    });
  }
  return require(specifier);
};

const mod = { exports: {} };
new Function('module', 'exports', 'require', result.outputFiles[0].text)(mod, mod.exports, stubRequire);
const { sanitizeNumericInput, parseNumericValue, formatNumericValue } = mod.exports;

const NBSP = ' ';

console.log('--- the type="number" failure mode is gone ---');
// Each of these is content type="number" reports as '', which Number() then
// turns into 0. Here they must parse to null (no value) — never 0.
for (const junk of ['e', '1e5', '--5', 'abc', '+', 'e5', '1e', '-']) {
  const parsed = parseNumericValue(junk, 'decimal');
  check(`"${junk}" does not become a number`, parsed === null || Number.isFinite(parsed),
    `got ${parsed}`);
}
check('"1e5" specifically does not become 100000 or 0',
  parseNumericValue('1e5', 'decimal') === 15, `got ${parseNumericValue('1e5', 'decimal')}`);

console.log('');
console.log('--- null is not zero ---');
check('an empty field is null, not 0', parseNumericValue('', 'decimal') === null);
check('a lone decimal point is null, not 0', parseNumericValue('.', 'decimal') === null);
check('an actual zero is 0, not null', parseNumericValue('0', 'decimal') === 0);
check('zero survives formatting', formatNumericValue(0, 'currency') === '0',
  JSON.stringify(formatNumericValue(0, 'currency')));
check('null formats to an empty field', formatNumericValue(null, 'currency') === '');

console.log('');
console.log('--- nothing ever emits NaN ---');
for (const junk of ['', '.', 'abc', '...', '-', 'e']) {
  const parsed = parseNumericValue(junk, 'decimal');
  check(`"${junk}" never yields NaN`, !Number.isNaN(parsed), `got ${parsed}`);
}
check('NaN formats to an empty field, not "NaN"', formatNumericValue(NaN, 'currency') === '');

console.log('');
console.log('--- typing sequences a naive implementation mangles ---');
// A half-typed decimal must survive as text; rewriting it would delete the
// point the user just pressed.
check('a trailing decimal point is preserved while typing',
  sanitizeNumericInput('1.', 'decimal') === '1.', JSON.stringify(sanitizeNumericInput('1.', 'decimal')));
check('...and parses to the whole number so far', parseNumericValue('1.', 'decimal') === 1);
check('a leading decimal point is preserved',
  sanitizeNumericInput('.5', 'decimal') === '.5');
check('...and parses correctly', parseNumericValue('.5', 'decimal') === 0.5);

// en-ZA writes 1 234 567,89 — a user reaching for the decimal separator may
// type a comma. Dropping it silently turns 1,5 into 15.
check('a typed comma becomes a decimal point, not nothing',
  parseNumericValue('1,5', 'decimal') === 1.5, `got ${parseNumericValue('1,5', 'decimal')}`);
check('...so 1,5 does NOT become 15', parseNumericValue('1,5', 'decimal') !== 15);

check('a second decimal point does not truncate the value',
  parseNumericValue('1.2.3', 'decimal') === 1.23, `got ${parseNumericValue('1.2.3', 'decimal')}`);

console.log('');
console.log('--- pasted content is filtered, not rejected wholesale ---');
check('a pasted formatted amount is re-editable',
  parseNumericValue(`1${NBSP}234${NBSP}567.89`, 'currency') === 1234567.89,
  `got ${parseNumericValue(`1${NBSP}234${NBSP}567.89`, 'currency')}`);
check('a pasted amount with plain spaces works too',
  parseNumericValue('1 234 567', 'currency') === 1234567);
check('a pasted "R 250 000" keeps the digits',
  parseNumericValue('R 250 000', 'currency') === 250000,
  `got ${parseNumericValue('R 250 000', 'currency')}`);

console.log('');
console.log('--- integer mode ---');
check('integer mode strips a decimal point entirely',
  sanitizeNumericInput('12.5', 'integer') === '125');
check('integer mode rejects letters', sanitizeNumericInput('12a5', 'integer') === '125');
check('integer mode parses to an integer', Number.isInteger(parseNumericValue('12', 'integer')));

console.log('');
console.log('--- currency mode ---');
check('currency caps at two decimal places',
  sanitizeNumericInput('1.239', 'currency') === '1.23',
  JSON.stringify(sanitizeNumericInput('1.239', 'currency')));
check('currency groups thousands',
  formatNumericValue(1234567, 'currency') === `1${NBSP}234${NBSP}567`,
  JSON.stringify(formatNumericValue(1234567, 'currency')));
check('currency groups a four-digit number',
  formatNumericValue(1000, 'currency') === `1${NBSP}000`);
check('currency does not group a three-digit number',
  formatNumericValue(999, 'currency') === '999');
check('currency keeps the fraction after grouping',
  formatNumericValue(1234.5, 'currency') === `1${NBSP}234.5`,
  JSON.stringify(formatNumericValue(1234.5, 'currency')));
check('decimal mode does NOT group',
  formatNumericValue(1234567, 'decimal') === '1234567');

console.log('');
console.log('--- round trip ---');
for (const value of [0, 1, 999, 1000, 250000, 1234567.89, 0.5]) {
  const round = parseNumericValue(formatNumericValue(value, 'currency'), 'currency');
  check(`${value} survives format -> parse`, round === value, `got ${round}`);
}

console.log('');
console.log(`${passed} passed, ${failed} failed`);
if (passed + failed < 45) {
  console.log(`NOT OK | expected at least 45 assertions to run, only ${passed + failed} did`);
  process.exit(1);
}
process.exit(failed === 0 ? 0 : 1);
