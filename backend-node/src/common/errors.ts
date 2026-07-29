/**
 * Typed domain errors (docs/validation-spec.md §A3).
 *
 * The problem these replace: AllExceptionsFilter inferred the HTTP status by
 * substring-matching the thrown message — `msg.includes('invalid')`,
 * `'not found'`, `'only admin'`. The wording of an error therefore *was* its
 * status, and a reworded message silently changed the response code.
 *
 * That was not theoretical. Running every thrown message in the codebase
 * through those rules, **18 of 38 fell through to 500 and raised a Sentry
 * alert** — for ordinary user errors:
 *
 *   "Only a SuperAdmin can perform this action."          -> 500 (should be 403)
 *   "Only Draft applications can be submitted."           -> 500 (should be 409)
 *   "Only the applicant can delete a document."           -> 500 (should be 403)
 *   "Disbursement amount must be greater than zero."      -> 500 (should be 400)
 *   "Requested amount must be between X and Y."           -> 500 (should be 400)
 *
 * In every one of those cases the caller got `"Internal server error"` with no
 * indication of what was wrong — the filter replaces the message on the 500
 * path — and an alert fired for something that is expected control flow. Two
 * failures at once: the user cannot act on it, and the noise trains everyone
 * to ignore the alerts.
 *
 * These classes are deliberately plain Errors rather than Nest HttpExceptions,
 * so services stay unaware of HTTP. The filter does the mapping.
 */

/** Machine-readable tokens, matching the §2 contract's `code`. */
export type DomainErrorCode =
  | 'validation'
  | 'permission'
  | 'not_found'
  | 'conflict';

export abstract class DomainError extends Error {
  abstract readonly code: DomainErrorCode;

  /**
   * The input responsible, when there is one. Lets a service-level rule — "the
   * requested amount exceeds the product maximum" — land on the right input
   * instead of a banner, the same way a DTO rejection does.
   */
  readonly field?: string;

  constructor(message: string, field?: string) {
    super(message);
    this.name = new.target.name;
    this.field = field;
    // Needed for `instanceof` to survive the ES5-era downlevelling tsc applies
    // to class extends of built-ins.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** The caller sent something wrong. 400. */
export class ValidationError extends DomainError {
  readonly code = 'validation' as const;
}

/** The caller is authenticated but not allowed. 403. */
export class PermissionError extends DomainError {
  readonly code = 'permission' as const;
}

/** The thing addressed does not exist, or is not visible to this caller. 404. */
export class NotFoundError extends DomainError {
  readonly code = 'not_found' as const;
}

/**
 * The request is well-formed but conflicts with current state. 409.
 *
 * Distinct from ValidationError on purpose: "only Draft applications can be
 * submitted" is not bad input — the same request would have succeeded a moment
 * earlier. A client can reasonably refetch and retry a 409; retrying a 400
 * unchanged is pointless.
 */
export class ConflictError extends DomainError {
  readonly code = 'conflict' as const;
}
