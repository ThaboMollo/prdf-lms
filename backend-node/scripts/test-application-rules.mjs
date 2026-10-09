/**
 * Tests for the two CreateApplicationDto rules added for the v1.1 manual review:
 * the 50-word minimum on `purpose`, and `monthsInOperation`.
 *
 *   npm run build && node scripts/test-application-rules.mjs
 *
 * Plain Node with no test framework, matching test-file-validation.mjs — see
 * item T2 in docs/outstanding-work.md. Exits non-zero on failure so CI can run
 * it as-is.
 *
 * The purpose cases are the point of this file. `purpose` reaches the API as
 * "<category>: <free text>" because the Step 3 dropdown is folded into the same
 * column before sending, so a word count that forgets to strip the prefix hands
 * out two or three free words to anyone who picks a longer category. Both forms
 * are asserted at the 49/50 boundary.
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

let dtoModule;
let classValidator;
let classTransformer;
try {
  dtoModule = require('../dist/applications/dto/create-application.dto.js');
  classValidator = require('class-validator');
  classTransformer = require('class-transformer');
} catch (e) {
  console.error('Could not load dist/ — run `npm run build` first.', e.message);
  process.exit(1);
}

const { CreateApplicationDto } = dtoModule;
const { validate } = classValidator;
const { plainToInstance } = classTransformer;

let passed = 0;
let failed = 0;

const words = (n) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');

async function check(name, payload, shouldReject) {
  const errors = await validate(plainToInstance(CreateApplicationDto, payload));
  const rejected = errors.length > 0;
  const messages = errors.flatMap((e) => Object.values(e.constraints || {})).join('; ');
  if (rejected === shouldReject) {
    passed++;
    console.log(`ok     | ${name}`);
  } else {
    failed++;
    console.log(`NOT OK | ${name} — expected ${shouldReject ? 'reject' : 'accept'}, got ${rejected ? 'reject' : 'accept'} ${messages}`);
  }
}

// --- purpose: 50-word minimum -------------------------------------------
await check('purpose: 49 words is refused', { purpose: words(49) }, true);
await check('purpose: 50 words is accepted', { purpose: words(50) }, false);
// The category prefix must not count towards the total.
await check('purpose: 49 words behind a category prefix is refused', { purpose: `Purchase Order: ${words(49)}` }, true);
await check('purpose: 50 words behind a category prefix is accepted', { purpose: `Purchase Order: ${words(50)}` }, false);
// A wizard autosave sends '' for every field the applicant has not reached.
// @AllowBlank must still let that through, or saving a draft breaks.
await check('purpose: blank passes (draft autosave)', { purpose: '' }, false);
await check('purpose: whitespace only is refused', { purpose: '        ' }, true);
await check('purpose: over the character ceiling is refused', { purpose: 'a '.repeat(600) }, true);

// --- monthsInOperation: 0-11 ---------------------------------------------
await check('months: 0 is accepted', { monthsInOperation: 0 }, false);
await check('months: 11 is accepted', { monthsInOperation: 11 }, false);
await check('months: 12 is refused — whole years belong in the years field', { monthsInOperation: 12 }, true);
await check('months: negative is refused', { monthsInOperation: -1 }, true);
await check('months: omitted is accepted', {}, false);

console.log(`\npassed=${passed} failed=${failed}`);
process.exit(failed ? 1 : 0);
