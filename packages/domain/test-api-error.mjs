/**
 * ApiError / parseApiResponse tests (docs/validation-spec.md §C1).
 *
 *   node packages/domain/test-api-error.mjs
 *
 * This is the frontend end of the field-attribution chain. The backend now
 * emits `errors: [{ field, message, code }]` (A1); this parser is what decides
 * whether that structure survives into the UI or gets flattened back into a
 * string, which is exactly what it used to do.
 *
 * So the assertions that matter are about *preservation* — that `errors`
 * arrives intact and addressable — plus the degenerate bodies a real deployment
 * throws at it: HTML error pages from a proxy, empty 502s, plain-text 413s.
 * A parser that only works on well-formed JSON would turn an infrastructure
 * blip into an unhandled SyntaxError and lose the status code with it.
 *
 * Bundled with esbuild the same way as packages/tenant-config/test-resolution.mjs
 * — these packages are consumed as TypeScript source, with no build step.
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
  entryPoints: [path.join(here, 'api-error.ts')],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  logLevel: 'silent',
});

const mod = { exports: {} };
new Function('module', 'exports', 'require', result.outputFiles[0].text)(mod, mod.exports, require);
const { ApiError, parseApiResponse } = mod.exports;

/** Build a Response with an explicit body/status, as fetch would return. */
function res(status, body, contentType = 'application/json') {
  return new Response(body, {
    status,
    statusText: status === 400 ? 'Bad Request' : '',
    headers: body === null ? undefined : { 'content-type': contentType },
  });
}

/**
 * Field errors off a thrown value, tolerating a non-ApiError.
 *
 * Needed so a regression that reverts to `throw new Error(...)` reports every
 * failed assertion instead of crashing on the first `.errors.length` — a run
 * that dies early also skips the minimum-assertion-count guard at the bottom,
 * which is the check that catches a suite silently stopping to run.
 */
function fieldsOf(err) {
  return Array.isArray(err?.errors) ? err.errors : [];
}

function fieldMapOf(err) {
  return typeof err?.fieldMap === 'function' ? err.fieldMap() : {};
}

/** Run parseApiResponse and return the thrown error (or null if it resolved). */
async function thrownBy(response) {
  try {
    await parseApiResponse(response);
    return null;
  } catch (err) {
    return err;
  }
}

console.log('--- success paths ---');
check('a 200 returns the parsed JSON body',
  (await parseApiResponse(res(200, '{"id":"abc"}'))).id === 'abc');

check('a 204 resolves to undefined rather than failing to parse an empty body',
  (await parseApiResponse(res(204, null))) === undefined);

console.log('');
console.log('--- field attribution survives (the point of C1) ---');
const validationBody = JSON.stringify({
  statusCode: 400,
  message: 'Please correct the highlighted fields.',
  errors: [
    { field: 'requestedAmount', message: 'requestedAmount must not be less than 1000', code: 'min' },
    { field: 'termMonths', message: 'termMonths must be a number', code: 'type' },
  ],
});
const validationError = await thrownBy(res(400, validationBody));

check('a 400 throws ApiError, not a bare Error', validationError instanceof ApiError);
check('the status code is preserved', validationError.status === 400, `got ${validationError?.status}`);
check('the top-level message is the server prose, not a stringified body',
  validationError.message === 'Please correct the highlighted fields.',
  JSON.stringify(validationError?.message));
check('both field errors survive', fieldsOf(validationError).length === 2,
  `got ${fieldsOf(validationError).length}`);
check('hasFieldErrors reports true', validationError.hasFieldErrors === true);
check('fieldMap() keys by field name',
  fieldMapOf(validationError).requestedAmount === 'requestedAmount must not be less than 1000');
check('fieldMap() covers every field', Object.keys(fieldMapOf(validationError)).length === 2);
check('the machine code is carried through, so UI logic need not match English',
  fieldsOf(validationError)[0]?.code === 'min');

// The regression this guards: the old parser did
//   throw new Error(`API ${status}: ${await response.text()}`)
// which produced a message containing the literal JSON. If that ever comes
// back, the raw payload will be visible inside the message.
check('the message does NOT contain the raw JSON payload',
  !String(validationError?.message).includes('"field"') && !String(validationError?.message).includes('statusCode'),
  validationError?.message);

console.log('');
console.log('--- first-wins on duplicate fields ---');
const dupe = await thrownBy(res(400, JSON.stringify({
  message: 'bad',
  errors: [
    { field: 'email', message: 'first', code: 'format' },
    { field: 'email', message: 'second', code: 'required' },
  ],
})));
check('fieldMap() keeps the first message for a repeated field',
  fieldMapOf(dupe).email === 'first', fieldMapOf(dupe).email);

console.log('');
console.log('--- degenerate bodies must not throw a parse error ---');
const html = await thrownBy(res(502, '<html><body><h1>502 Bad Gateway</h1></body></html>', 'text/html'));
check('an HTML error page still yields an ApiError', html instanceof ApiError);
check('...with the real status, not a parse failure', html?.status === 502, `got ${html?.status}`);
check('...and no phantom field errors', fieldsOf(html).length === 0);

const empty = await thrownBy(res(500, ''));
check('an empty body still yields an ApiError', empty instanceof ApiError);
check('...with the status preserved', empty?.status === 500);
check('...and a non-empty message to show the user', typeof empty?.message === 'string' && empty.message.length > 0,
  JSON.stringify(empty?.message));

const truncated = await thrownBy(res(413, 'x'.repeat(5000), 'text/plain'));
check('an oversized non-JSON body is truncated rather than rendered whole',
  String(truncated?.message).length <= 200, `got ${String(truncated?.message).length} chars`);

console.log('');
console.log('--- malformed errors arrays are ignored, not trusted ---');
const junk = await thrownBy(res(400, JSON.stringify({
  message: 'bad',
  errors: ['not an object', null, 42, { message: 'no field key' }],
})));
check('entries without a string `field` are dropped', fieldsOf(junk).length === 0,
  JSON.stringify(fieldsOf(junk)));

const notArray = await thrownBy(res(400, JSON.stringify({ message: 'bad', errors: { field: 'x' } })));
check('a non-array `errors` does not become a field list', fieldsOf(notArray).length === 0);

console.log('');
console.log('--- NestJS default validation shape (routes not yet on A1) ---');
const legacy = await thrownBy(res(400, JSON.stringify({
  statusCode: 400,
  message: ['purpose should not be empty', 'termMonths must be an integer'],
})));
check('an array message is joined into readable prose',
  legacy?.message === 'purpose should not be empty, termMonths must be an integer',
  JSON.stringify(legacy?.message));

console.log('');
console.log('--- instanceof across the bundle boundary ---');
check('a hand-built ApiError is still an Error', new ApiError(400, 'x') instanceof Error);
check('an ApiError with no errors reports hasFieldErrors false',
  new ApiError(400, 'x').hasFieldErrors === false);

console.log('');
console.log(`${passed} passed, ${failed} failed`);
if (passed < 24) {
  console.log(`NOT OK | expected at least 24 assertions to run, only ${passed + failed} did`);
  process.exit(1);
}
process.exit(failed === 0 ? 0 : 1);
