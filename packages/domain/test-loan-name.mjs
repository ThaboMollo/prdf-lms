/**
 * Loan-name tests.
 *
 *   node packages/domain/test-loan-name.mjs
 *
 * The name is what a client and a loan officer say to each other on the phone,
 * so the cases that matter are the degenerate ones: a client with no profile
 * row, a staff-invited client whose full_name is still an email address, and a
 * multi-word business name. Bundled with esbuild the same way as
 * test-pricing.mjs — the package is consumed as TypeScript source with no
 * build step.
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

function eq(name, actual, expected) {
  check(name, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const result = await build({
  entryPoints: [path.join(here, 'loanName.ts')],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  logLevel: 'silent',
});

const mod = { exports: {} };
new Function('module', 'exports', 'require', result.outputFiles[0].text)(mod, mod.exports, require);
const { buildLoanName, applicantFirstName, formatLoanNameDate } = mod.exports;

// Local midday avoids the date shifting a day under a timezone offset when the
// test runs on a machine east or west of the data's origin.
const SEP_27 = new Date(2026, 8, 27, 12, 0, 0);

// ---- the canonical case -------------------------------------------------
eq(
  'canonical name',
  buildLoanName({ businessName: 'OVO', applicantFullName: 'Thabo Mponya', date: SEP_27 }),
  'OVO Thabo 27 Sep 2026',
);

eq(
  'multi-word business name is kept whole',
  buildLoanName({ businessName: 'Blue Ocean Logistics', applicantFullName: 'Thabo Mponya', date: new Date(2026, 2, 12, 12) }),
  'Blue Ocean Logistics Thabo 12 Mar 2026',
);

eq(
  'single-digit day is not zero-padded',
  buildLoanName({ businessName: 'OVO', applicantFullName: 'Thabo', date: new Date(2026, 0, 5, 12) }),
  'OVO Thabo 5 Jan 2026',
);

// ---- date formatting ----------------------------------------------------
eq('formats an ISO string', formatLoanNameDate('2026-09-27T08:15:00.000Z')?.endsWith('Sep 2026'), true);
eq('null date', formatLoanNameDate(null), null);
eq('unparseable date', formatLoanNameDate('not-a-date'), null);
eq('December is Dec, not Dez/Sept-style', formatLoanNameDate(new Date(2026, 11, 1, 12)), '1 Dec 2026');

// ---- first-name extraction ---------------------------------------------
eq('leading token of a full name', applicantFirstName('Thabo Mponya'), 'Thabo');
eq('single-word full name', applicantFirstName('Thabo'), 'Thabo');
eq('extra whitespace is tolerated', applicantFirstName('  Thabo   Mponya '), 'Thabo');
eq('an email full_name is rejected', applicantFirstName('mollo.t.mponya@gmail.com'), null);
eq('empty full name', applicantFirstName('   '), null);
eq('missing full name', applicantFirstName(undefined), null);

// ---- degenerate inputs --------------------------------------------------
eq(
  'assisted client whose full_name is still an email drops the name part',
  buildLoanName({ businessName: 'OVO', applicantFullName: 'mollo.t.mponya@gmail.com', date: SEP_27 }),
  'OVO 27 Sep 2026',
);

eq(
  'no profile row yet',
  buildLoanName({ businessName: 'OVO', applicantFullName: null, date: SEP_27 }),
  'OVO 27 Sep 2026',
);

eq(
  'no business name gets a noun so it still reads as a name',
  buildLoanName({ businessName: null, applicantFullName: 'Thabo Mponya', date: SEP_27 }),
  'Loan Application Thabo 27 Sep 2026',
);

eq(
  'nothing at all',
  buildLoanName({ businessName: null, applicantFullName: null, date: null }),
  'Loan Application',
);

eq(
  'blank business name is treated as absent, not as an empty word',
  buildLoanName({ businessName: '   ', applicantFullName: 'Thabo', date: SEP_27 }),
  'Loan Application Thabo 27 Sep 2026',
);

eq(
  'internal double space in a business name is collapsed',
  buildLoanName({ businessName: 'Blue  Ocean', applicantFullName: 'Thabo', date: SEP_27 }),
  'Blue Ocean Thabo 27 Sep 2026',
);

console.log(`\n${passed} passed, ${failed} failed`);
check('ran the full suite (>=18 assertions)', passed + failed >= 18);
if (failed > 0) process.exit(1);
