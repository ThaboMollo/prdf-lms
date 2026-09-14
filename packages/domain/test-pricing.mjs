/**
 * Pricing engine tests — the money math confirmed by the PO/client 2026-09-10.
 *
 *   node packages/domain/test-pricing.mjs
 *
 * The canonical worked example (docs/credit-model-phase1-plan.md §7):
 *   R250,000 · Moderate (margin 6.5 -> annual 15.5%) · 30 days financed.
 * Asserted to the cent for BOTH rounding modes so a change to the rounding
 * constant is a deliberate, test-visible decision, not a silent drift. The
 * same vectors are mirrored in the backend spec against the synced copy
 * (backend-node/src/common/pricing.ts) — if the two engines ever disagree,
 * both suites fail.
 *
 * Bundled with esbuild the same way as test-api-error.mjs — the package is
 * consumed as TypeScript source with no build step.
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
  check(name, actual === expected, `expected ${expected}, got ${actual}`);
}

const result = await build({
  entryPoints: [path.join(here, 'pricing.ts')],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  logLevel: 'silent',
});

const mod = { exports: {} };
new Function('module', 'exports', 'require', result.outputFiles[0].text)(mod, mod.exports, require);
const { round2, annualRate, calcInterest, calcPenalty, quote } = mod.exports;

/** The confirmed configuration values (mirror pricing_config seed). */
function config(roundingMode) {
  return {
    primeRatePct: 10.5,
    initiationFee: 1000,
    managementFeePct: 3,
    penaltyRatePct: 2,
    penaltyPeriodDays: 30,
    daysPerYear: 365,
    roundingMode,
  };
}

// The worked-example anchor uses Low grade: margin 5 -> 15.5% annual.
const LOW_MARGIN = 5;

console.log('--- round2 ---');
eq('CEIL rounds 3184.9315 up', round2(3184.9315068, 'CEIL_2DP'), 3184.94);
eq('HALF_UP rounds 3184.9315 down', round2(3184.9315068, 'HALF_UP_2DP'), 3184.93);
eq('CEIL leaves exact cents', round2(7500, 'CEIL_2DP'), 7500);
eq('penalty base rounds correctly (float-safe)', round2(5063.6986, 'CEIL_2DP'), 5063.7);
eq('HALF_UP half-cent rounds up', round2(1.005, 'HALF_UP_2DP'), 1.01);

console.log('--- annual rate ---');
eq('Low grade (margin 5) -> 15.5', annualRate(config('CEIL_2DP'), 5), 15.5);
eq('Moderate (6.5) -> 17', annualRate(config('CEIL_2DP'), 6.5), 17);
eq('High (8.5) -> 19', annualRate(config('CEIL_2DP'), 8.5), 19);
eq('Worst (10.5) -> 21', annualRate(config('CEIL_2DP'), 10.5), 21);

console.log('--- worked example: CEIL_2DP (the configured mode) ---');
{
  const q = quote(config('CEIL_2DP'), {
    principal: 250000,
    daysFinanced: 30,
    riskGrade: 'Low',
    marginPct: LOW_MARGIN,
    daysLate: 30,
  });
  eq('annual rate 15.5%', q.annualRatePct, 15.5);
  eq('interest 3184.94', q.interest, 3184.94);
  eq('initiation 1000', q.initiationFee, 1000);
  eq('management 7500', q.managementFee, 7500);
  eq('penalty @30d 5063.70', q.penalty, 5063.7);
  eq('total due to funder 253184.94', q.totalDueToFunder, 253184.94);
  eq('total fees 8500', q.totalFees, 8500);
  eq('total client revenue 16748.64', q.totalClientRevenue, 16748.64);

  const [b30, b60, b90, b120] = q.latePaymentScenarios;
  eq('bucket 30d penalty', b30.penalty, 5063.7);
  eq('bucket 60d penalty', b60.penalty, 10127.4);
  eq('bucket 90d penalty', b90.penalty, 15191.1);
  eq('bucket 120d penalty', b120.penalty, 20254.8);
  eq('bucket 120d total revenue', b120.totalRevenue, 31939.74);
}

console.log('--- worked example: HALF_UP_2DP (matches client spreadsheet) ---');
{
  const q = quote(config('HALF_UP_2DP'), {
    principal: 250000,
    daysFinanced: 30,
    riskGrade: 'Low',
    marginPct: LOW_MARGIN,
    daysLate: 30,
  });
  eq('interest 3184.93', q.interest, 3184.93);
  eq('penalty @30d 5063.70', q.penalty, 5063.7);
  eq('total due to funder 253184.93', q.totalDueToFunder, 253184.93);
  eq('total client revenue 16748.63', q.totalClientRevenue, 16748.63);
}

console.log('--- penalty is linear / non-compounding ---');
{
  const cfg = config('HALF_UP_2DP'); // avoid ceiling artefacts in the ratio
  const base = 253184.93;
  const p30 = calcPenalty(cfg, base, 30);
  const p60 = calcPenalty(cfg, base, 60);
  const p120 = calcPenalty(cfg, base, 120);
  // Non-compounding: penalty(kn) == k * penalty(n), linear in daysLate. Each
  // bucket is rounded independently, so allow a 2-cent tolerance for rounding —
  // compounding would diverge by whole Rands, not cents.
  check('penalty(60) == 2 * penalty(30)', Math.abs(p60 - 2 * p30) < 0.02, `${p60} vs ${2 * p30}`);
  check('penalty(120) == 4 * penalty(30)', Math.abs(p120 - 4 * p30) < 0.02, `${p120} vs ${4 * p30}`);
}

console.log('--- edge cases ---');
{
  const cfg = config('CEIL_2DP');
  eq('daysLate 0 -> no penalty', calcPenalty(cfg, 253184.94, 0), 0);
  eq('negative daysLate -> no penalty', calcPenalty(cfg, 253184.94, -5), 0);
  eq('daysFinanced 0 -> no interest', calcInterest(cfg, 250000, 15.5, 0), 0);
  const noPenalty = quote(cfg, { principal: 250000, daysFinanced: 30, riskGrade: 'Low', marginPct: 5, daysLate: 0 });
  eq('quote with no daysLate -> penalty 0', noPenalty.penalty, 0);
  eq('quote total excludes penalty when on-time', noPenalty.totalClientRevenue, round2(3184.94 + 1000 + 7500, 'CEIL_2DP'));
}

console.log('--- backend copy is a faithful mirror (drift check) ---');
{
  // Bundle the backend's synced copy and assert it produces identical output
  // to the canonical engine on the worked example. This is the drift guard the
  // backend has no test runner to provide itself.
  const backendResult = await build({
    entryPoints: [path.join(here, '../../backend-node/src/common/pricing.ts')],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    logLevel: 'silent',
  });
  const bmod = { exports: {} };
  new Function('module', 'exports', 'require', backendResult.outputFiles[0].text)(bmod, bmod.exports, require);

  const input = { principal: 250000, daysFinanced: 30, riskGrade: 'Low', marginPct: LOW_MARGIN, daysLate: 30 };
  for (const roundingMode of ['CEIL_2DP', 'HALF_UP_2DP']) {
    const cfg = config(roundingMode);
    const canonical = JSON.stringify(quote(cfg, input));
    const backend = JSON.stringify(bmod.exports.quote(cfg, input));
    check(`backend copy matches canonical (${roundingMode})`, canonical === backend, 'engines have drifted');
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
check('ran the full suite (>=25 assertions)', passed + failed >= 25);
if (failed > 0) process.exit(1);
