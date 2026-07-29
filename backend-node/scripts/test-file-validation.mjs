/**
 * Tests for src/common/file-validation.ts (spec §6.3).
 *
 *   npm run build && node scripts/test-file-validation.mjs
 *
 * Plain Node with no test framework, because none is configured in this
 * project yet — see item T2 in docs/outstanding-work.md. When Jest lands,
 * port these; until then this keeps the verification durable rather than
 * something that only ever ran once in a terminal.
 *
 * Exits non-zero on failure so it can be wired into CI as-is.
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

let validation;
try {
  validation = require('../dist/common/file-validation.js');
} catch {
  console.error('Could not load dist/common/file-validation.js — run `npm run build` first.');
  process.exit(1);
}

const { validateDocumentUpload, assertStoragePathWithinApplication } = validation;

const APP = '11111111-2222-3333-4444-555555555555';
const OTHER_APP = '99999999-0000-0000-0000-000000000000';

let passed = 0;
let failed = 0;

function expect(name, fn, shouldThrow) {
  let threw = false;
  let message = '';
  try {
    fn();
  } catch (error) {
    threw = true;
    message = error.message;
  }
  if (threw === shouldThrow) {
    passed++;
    console.log(`ok     | ${name}`);
  } else {
    failed++;
    console.log(
      `NOT OK | ${name} — expected ${shouldThrow ? 'rejection' : 'acceptance'}` +
        (threw ? `, got: ${message}` : ', but it was accepted'),
    );
  }
}

console.log('--- upload type validation ---');
expect('accepts .pdf with application/pdf', () => validateDocumentUpload('report.pdf', 'application/pdf'), false);
expect(
  'accepts .docx with its mime type',
  () =>
    validateDocumentUpload(
      'statement.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ),
  false,
);
expect('accepts a mime type with a charset parameter', () => validateDocumentUpload('a.pdf', 'application/pdf; charset=binary'), false);
expect('accepts a missing contentType when the extension is allowed', () => validateDocumentUpload('a.pdf'), false);
expect('rejects a disallowed extension', () => validateDocumentUpload('evil.exe', 'application/pdf'), true);
expect('rejects an allowed extension with a disallowed mime type', () => validateDocumentUpload('evil.pdf', 'application/x-msdownload'), true);
expect('rejects a file with no extension', () => validateDocumentUpload('noext', 'application/pdf'), true);
expect(
  'strips directory components from the filename',
  () => {
    const result = validateDocumentUpload('../../evil.pdf', 'application/pdf');
    if (result.includes('/') || result.includes('..')) {
      throw new Error(`traversal survived sanitisation: ${result}`);
    }
  },
  false,
);

console.log('');
console.log('--- storage path ownership ---');
// Regression: confirmUpload trusted a client-supplied storagePath. A caller
// could record a document row on their own application pointing at another
// borrower's object key, then request a download URL — the ownership query
// passed, and the URL was signed with the service role key, bypassing storage
// RLS. These assertions cover that.
expect('accepts a path inside the application prefix', () => assertStoragePathWithinApplication(`applications/${APP}/abc-report.pdf`, APP), false);
expect("rejects another application's path", () => assertStoragePathWithinApplication(`applications/${OTHER_APP}/x.pdf`, APP), true);
expect('rejects directory traversal', () => assertStoragePathWithinApplication(`applications/${APP}/../${OTHER_APP}/x.pdf`, APP), true);
expect('rejects a nested path', () => assertStoragePathWithinApplication(`applications/${APP}/sub/x.pdf`, APP), true);
expect('rejects an empty object name', () => assertStoragePathWithinApplication(`applications/${APP}/`, APP), true);
expect('rejects a prefix-confusion path', () => assertStoragePathWithinApplication(`applications/${APP}-evil/x.pdf`, APP), true);
expect('rejects a backslash path', () => assertStoragePathWithinApplication(`applications\\${APP}\\x.pdf`, APP), true);

console.log('');
console.log(`passed=${passed} failed=${failed}`);
process.exit(failed > 0 ? 1 : 0);
