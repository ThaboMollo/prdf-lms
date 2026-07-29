/**
 * useFormErrors decision-logic tests (docs/validation-spec.md §C2).
 *
 *   node packages/ui-kit/test-form-errors.mjs
 *
 * The hook itself is thin glue over four pure functions, and those functions
 * hold everything worth getting wrong: which failures become *field* errors
 * (attributable to an input) and which become a *banner* (not the user's input
 * being wrong, or an input that isn't on screen).
 *
 * The failure that matters is not a crash. It is a rejection landing in the
 * wrong place — a network timeout painted onto the email field, or a real
 * per-field message silently swallowed because the banner was suppressed. Both
 * look fine in a build and leave the user unable to proceed.
 *
 * Bundled with esbuild like the sibling suites; these packages are consumed as
 * TypeScript source with no build step. React is stubbed because the pure
 * exports don't touch it and pulling in the real one just to reach them would
 * be pointless.
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

/**
 * Both the hook and ApiError come out of ONE bundle, via a synthetic entry
 * point. Building them separately gives two distinct ApiError classes, and the
 * hook's `instanceof` check would then reject the very errors this suite feeds
 * it — a false failure that says nothing about the real app, where Vite
 * resolves both imports to the same module.
 */
const result = await build({
  stdin: {
    contents: `
      export * from './hooks/useFormErrors'
      export { ApiError, parseApiResponse } from '../domain/api-error'
    `,
    resolveDir: here,
    sourcefile: 'test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  logLevel: 'silent',
  // The pure exports never call into React or touch the DOM. Stubbing it keeps
  // this suite dependency-free; if a future change makes a pure function depend
  // on React, the stub throws rather than passing quietly.
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
const {
  fieldErrorsFromZod,
  formErrorFromZod,
  fieldErrorsFromThrown,
  formErrorFromThrown,
  parseApiResponse,
} = mod.exports;

/** An ApiError of the same class identity the bundled hook checks against. */
function apiError(status, message, errors) {
  const res = new Response(JSON.stringify({ message, errors }), { status });
  return parseApiResponse(res).then(() => null, (err) => err);
}

console.log('--- zod issues become field errors ---');
const zodError = {
  issues: [
    { path: ['businessName'], message: 'Business name is required.' },
    { path: ['monthlyRevenue'], message: 'Enter a number.' },
  ],
};
const zodFields = fieldErrorsFromZod(zodError);
check('each issue lands under its field', zodFields.businessName === 'Business name is required.');
check('all issues are kept', Object.keys(zodFields).length === 2, JSON.stringify(zodFields));

check('nested paths are dotted, matching the backend key format',
  fieldErrorsFromZod({ issues: [{ path: ['consent', 'items', 0, 'answer'], message: 'Required.' }] })
    ['consent.items.0.answer'] === 'Required.');

check('the first issue per field wins',
  fieldErrorsFromZod({ issues: [
    { path: ['email'], message: 'first' },
    { path: ['email'], message: 'second' },
  ] }).email === 'first');

// A schema-level .refine() has no path. Dropping it onto a field named ''
// would render an error under nothing; dropping it entirely would lose a real
// rule. It has to become a form-level message.
const rootRefine = { issues: [{ path: [], message: 'Passwords do not match.' }] };
check('a pathless refinement is NOT turned into a field named ""',
  Object.keys(fieldErrorsFromZod(rootRefine)).length === 0,
  JSON.stringify(fieldErrorsFromZod(rootRefine)));
check('...it surfaces as a form-level error instead',
  formErrorFromZod(rootRefine) === 'Passwords do not match.');
check('formErrorFromZod is null when every issue is attributable',
  formErrorFromZod(zodError) === null);

check('an empty issue list yields no errors',
  Object.keys(fieldErrorsFromZod({ issues: [] })).length === 0);

console.log('');
console.log('--- thrown values become field errors only when attributable ---');
const validation = await apiError(400, 'Please correct the highlighted fields.', [
  { field: 'requestedAmount', message: 'Must be at least R1 000.', code: 'min' },
  { field: 'termMonths', message: 'Must be a whole number.', code: 'type' },
]);
const serverFields = fieldErrorsFromThrown(validation);
check('an ApiError with field errors produces a field map',
  serverFields.requestedAmount === 'Must be at least R1 000.', JSON.stringify(serverFields));
check('every reported field is present', Object.keys(serverFields).length === 2);

// This is the assertion that stops a network blip being painted onto an input.
const network = new TypeError('Failed to fetch');
check('a network failure produces NO field errors',
  Object.keys(fieldErrorsFromThrown(network)).length === 0);

const serverFault = await apiError(500, 'Internal server error', undefined);
check('a 500 with no errors array produces no field errors',
  Object.keys(fieldErrorsFromThrown(serverFault)).length === 0);

const forbidden = await apiError(403, 'Forbidden', []);
check('a 403 produces no field errors',
  Object.keys(fieldErrorsFromThrown(forbidden)).length === 0);

check('a non-Error thrown value is handled without crashing',
  Object.keys(fieldErrorsFromThrown('a string')).length === 0);

console.log('');
console.log('--- the banner appears exactly when nothing could be pointed at ---');
check('focus succeeded -> banner stays empty, message is already on the field',
  formErrorFromThrown(validation, true) === null);

// The apply wizard's review step: the rejected inputs live on earlier steps and
// are not mounted, so focus cannot move. Suppressing the banner here would
// leave the user with a failed submit and no visible reason.
check('focus failed -> the banner carries the message',
  formErrorFromThrown(validation, false) === 'Please correct the highlighted fields.');

check('a network failure always reaches the banner',
  formErrorFromThrown(network, false) === 'Failed to fetch');

check('a non-Error thrown value still yields readable prose',
  typeof formErrorFromThrown({ weird: true }, false) === 'string' &&
  formErrorFromThrown({ weird: true }, false).length > 0);

check('a 500 reaches the banner with the server message',
  formErrorFromThrown(serverFault, false) === 'Internal server error');

console.log('');
console.log('--- field/banner are mutually exclusive on the happy attribution path ---');
// Together these two are the invariant: an attributed, focusable failure shows
// once (on the field), and an unattributable one shows once (in the banner).
// Never zero times, never twice.
const attributedFocused = {
  fields: fieldErrorsFromThrown(validation),
  banner: formErrorFromThrown(validation, true),
};
check('attributed + focused: fields populated, banner empty',
  Object.keys(attributedFocused.fields).length > 0 && attributedFocused.banner === null);

const unattributed = {
  fields: fieldErrorsFromThrown(network),
  banner: formErrorFromThrown(network, false),
};
check('unattributed: fields empty, banner populated',
  Object.keys(unattributed.fields).length === 0 && !!unattributed.banner);

console.log('');
console.log(`${passed} passed, ${failed} failed`);
if (passed + failed < 20) {
  console.log(`NOT OK | expected at least 20 assertions to run, only ${passed + failed} did`);
  process.exit(1);
}
process.exit(failed === 0 ? 0 : 1);
