import { ValidateIf } from 'class-validator';

/**
 * Treat an empty string as "not answered yet" rather than as an invalid value.
 *
 * `@IsOptional()` only skips validation for `undefined` and `null`. An empty
 * string is still validated — so the moment the DTOs were tightened (workstream
 * A4), an ordinary wizard autosave started failing with nine errors at once:
 * `buildDraftPayload` sends `purpose: ''`, `industry: ''`, `businessName: ''`
 * for every field the user has not reached yet, and it fires on a debounce
 * while they type.
 *
 * A draft is a partial object by definition. Blank means unanswered, and
 * refusing to save an unanswered field would break the wizard for every user
 * before they ever reached the end of it.
 *
 * Note this deliberately does NOT coerce '' to undefined. The service layer
 * uses a set-if-provided pattern, so undefined means "leave the stored value
 * alone" while '' means "clear it" — collapsing the two would make clearing a
 * field impossible.
 *
 * Completeness is enforced at submit instead, where it belongs: see
 * ApplicationsService.ensureApplicationComplete().
 */
export function AllowBlank(): PropertyDecorator {
  return ValidateIf((_object, value) => value !== '');
}
