/**
 * Client-portal pricing adapter tests.
 *
 *   node client-ui/scripts/test-credit-quote.mjs
 *
 * packages/domain/test-pricing.mjs already pins the engine against the
 * client's spreadsheet. This covers the one piece of arithmetic that sits
 * between the engine and the applicant: the months -> days financed
 * conversion, and the "from" quote built on top of it.
 *
 * Bundled with esbuild the same way as the packages/* suites — client-ui is
 * consumed as TypeScript source with no build step. creditQuote.ts's only
 * non-type import is the engine itself, so nothing React comes along.
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, '../index.js'));
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
  check(name, actual === expected, `expected ${expected}, got ${actual}`);
}

function near(name, actual, expected, tolerance) {
  check(name, Math.abs(actual - expected) <= tolerance, `expected ${expected} ±${tolerance}, got ${actual}`);
}

const result = await build({
  entryPoints: [path.join(here, '../src/lib/creditQuote.ts')],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  logLevel: 'silent',
});
const mod = { exports: {} };
new Function('module', 'exports', 'require', result.outputFiles[0].text)(mod, mod.exports, require);
const { monthsToDays, indicativeQuote, formatIndicativeRate, formatRateCeiling } = mod.exports;

/** Mirrors the pricing_config seed + the cheapest active risk grade. */
const CONFIG = {
  primeRatePct: 10.5,
  initiationFee: 1000,
  managementFeePct: 3,
  penaltyRatePct: 2,
  penaltyPeriodDays: 30,
  daysPerYear: 365,
  roundingMode: 'CEIL_2DP',
  indicativeGrade: 'Low',
  indicativeMarginPct: 5,
  indicativeAnnualRatePct: 15.5,
  maxMarginPct: 10.5,
  maxAnnualRatePct: 21,
};

console.log('--- months -> days financed ---');
// The three the spreadsheet's Short-Term rows use must land exactly, because
// those are the terms the model was signed off on.
eq('12 months is a full year', monthsToDays(12, 365), 365);
eq('24 months', monthsToDays(24, 365), 730);
eq('36 months', monthsToDays(36, 365), 1095);
// Documented divergence: the sheet treats these as 30-day months (90 / 180).
eq('3 months (sheet says 90)', monthsToDays(3, 365), 91);
eq('6 months (sheet says 180)', monthsToDays(6, 365), 183);
eq('1 month', monthsToDays(1, 365), 30);
eq('tracks daysPerYear, not a hardcoded 365', monthsToDays(12, 360), 360);

console.log('--- indicative quote ---');
{
  // Short Term Base!25 — R750,000 over 365 days. Quoted at Low here rather
  // than the sheet's Moderate, since the portal always prices best-case.
  const q = indicativeQuote(CONFIG, 750000, 12);
  eq('days financed', q.daysFinanced, 365);
  eq('annual rate is the indicative one', q.annualRatePct, 15.5);
  near('interest = P x 15.5%', q.interest, 116250, 0.01);
  eq('initiation fee', q.initiationFee, 1000);
  near('management fee = 3% of principal', q.managementFee, 22500, 0.01);
  near('total repayable (incl. fees)', q.totalRepayable, 889750, 0.02);
  eq('no penalty on an indicative quote', q.penalty, 0);
}

console.log('--- hero figures (fees excluded) ---');
{
  // The three columns of the client's 2026-09-25 mockup, at its own worked
  // example: R250,000 over 12 months. The hero shows capital + interest only —
  // the once-off fees are itemised in the apply wizard's cost card instead.
  const q = indicativeQuote(CONFIG, 250000, 12);
  near('total repayment excludes fees', q.totalRepaymentExclFees, 288750, 0.01);
  near('estimated total interest', q.interest, 38750, 0.01);
  near('monthly instalment', q.monthlyInstalment, 24062.5, 0.01);

  // The mockup's own arithmetic: instalment x months reconciles to the total
  // beside it, so an applicant can check the strip adds up.
  near('instalment x months == total repayment', q.monthlyInstalment * 12, q.totalRepaymentExclFees, 0.05);

  // ... and the fee-bearing total stays available for the wizard, unchanged.
  near('fees still carried for the wizard', q.totalRepayable - q.totalRepaymentExclFees, 8500, 0.01);
}

{
  // Band floor and ceiling — the R250,000-R1,000,000 product limits.
  const floor = indicativeQuote(CONFIG, 250000, 3);
  near('R250k / 3mo interest', floor.interest, 250000 * 0.155 / 365 * 91, 0.01);
  const ceiling = indicativeQuote(CONFIG, 1000000, 36);
  eq('R1m / 36mo runs 1095 days', ceiling.daysFinanced, 1095);
  near('R1m / 36mo interest', ceiling.interest, 465000, 0.01);
}

console.log('--- rate labels ---');
eq('indicative rate framed as a floor', formatIndicativeRate(CONFIG), 'From 15.50% p.a.');
// The hero discloses the ceiling as a margin over Prime, so the statement
// survives a repo-rate change without the copy going stale.
eq('hero discloses the ceiling', formatRateCeiling(CONFIG), 'Prime + up to 10.50%');

console.log(`\n${passed} passed, ${failed} failed`);
check('ran the full suite (>=15 assertions)', passed + failed >= 15);
if (failed > 0) process.exit(1);
