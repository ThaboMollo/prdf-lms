import { BadRequestException, ValidationError } from '@nestjs/common';

/**
 * Field-level validation error, as delivered to the frontend
 * (docs/validation-spec.md §2).
 */
export interface FieldError {
  /** Wire name — the DTO property, e.g. `requestedAmount`. Never a label. */
  field: string;
  /** User-facing prose, shown verbatim. */
  message: string;
  /** Stable machine token (`required`, `min`, `max`, `pattern`, …). */
  code: string;
}

/**
 * class-validator's constraint keys, mapped to stable tokens the frontend can
 * branch on without matching English.
 *
 * Anything unmapped falls through as its own key, which is still stable —
 * the point is that tests and UI logic never depend on prose.
 */
const CODE_BY_CONSTRAINT: Record<string, string> = {
  isNotEmpty: 'required',
  isDefined: 'required',
  min: 'min',
  max: 'max',
  isPositive: 'min',
  minLength: 'minLength',
  maxLength: 'maxLength',
  matches: 'pattern',
  isEmail: 'format',
  isUUID: 'format',
  isDateString: 'format',
  isNumber: 'type',
  isInt: 'type',
  isString: 'type',
  isBoolean: 'type',
  isIn: 'enum',
  whitelistValidation: 'unknown',
};

/**
 * Which failure to report when a value breaks several rules at once.
 *
 * Lower number wins. The ordering follows what actually explains the problem:
 * a missing value explains everything downstream, and a wrong *type* explains
 * every range failure — `amount: "lots"` fails `isNumber`, `isPositive` and
 * `min` simultaneously, and "amount must not be less than 1000" sends the user
 * hunting for a bigger number when the real issue is that they typed a word.
 *
 * Without this the winner is whichever key class-validator happens to put
 * first in the constraints object, which is decorator-evaluation order — not
 * something to hang user-facing prose on.
 */
const CONSTRAINT_PRIORITY: Record<string, number> = {
  isDefined: 0,
  isNotEmpty: 0,
  isNumber: 1,
  isInt: 1,
  isString: 1,
  isBoolean: 1,
  isArray: 1,
  isIn: 2,
  isEnum: 2,
  isEmail: 2,
  isUUID: 2,
  isDateString: 2,
  matches: 2,
};

const DEFAULT_PRIORITY = 3;

function pickConstraint(constraints: Record<string, string>): [string, string] {
  const entries = Object.entries(constraints);
  return entries.reduce((best, candidate) =>
    (CONSTRAINT_PRIORITY[candidate[0]] ?? DEFAULT_PRIORITY) <
    (CONSTRAINT_PRIORITY[best[0]] ?? DEFAULT_PRIORITY)
      ? candidate
      : best,
  );
}

/**
 * Flatten class-validator's nested errors into a flat, addressable list.
 *
 * Nested objects and arrays produce dotted paths (`consent.items.0.answer`) so
 * a form can map an error onto the exact input that caused it.
 *
 * Only ONE constraint per field is reported — the most explanatory one, per
 * CONSTRAINT_PRIORITY. Showing three messages under one input is noise, and
 * they are usually three descriptions of the same mistake.
 */
export function flattenValidationErrors(errors: ValidationError[], parentPath = ''): FieldError[] {
  const out: FieldError[] = [];

  for (const error of errors) {
    const path = parentPath ? `${parentPath}.${error.property}` : error.property;

    if (error.constraints) {
      const [constraint, message] = pickConstraint(error.constraints);
      out.push({
        field: path,
        message,
        code: CODE_BY_CONSTRAINT[constraint] ?? constraint,
      });
    }

    if (error.children?.length) {
      out.push(...flattenValidationErrors(error.children, path));
    }
  }

  return out;
}

/**
 * ValidationPipe exceptionFactory producing the §2 contract.
 *
 * The default factory reduces `ValidationError[]` — which carries `property`
 * per failure — to an array of English sentences. The field name survives only
 * inside the prose, so nothing downstream can attach an error to the input
 * that caused it. Every form in both apps therefore showed server rejections
 * as a single banner, even though the backend knew exactly which field was
 * wrong.
 *
 * `message` stays a plain string so existing consumers keep working;
 * `errors` is the new, structured half. Additive on purpose.
 */
export function validationExceptionFactory(errors: ValidationError[]): BadRequestException {
  const fieldErrors = flattenValidationErrors(errors);

  return new BadRequestException({
    statusCode: 400,
    message:
      fieldErrors.length === 1
        ? fieldErrors[0].message
        : 'Please correct the highlighted fields.',
    errors: fieldErrors,
  });
}
