/**
 * Field-level error display, shared by both apps
 * (docs/validation-spec.md §2, workstream C3).
 *
 * Previously this lived only in client-ui and rendered a bare `<p role="alert">`
 * with no association to the input it described. Visually a sighted user infers
 * the link from proximity; a screen-reader user gets an announcement with no
 * indication of *which* field is wrong, and nothing tells the browser the input
 * is invalid at all. `fieldErrorAttrs` closes that by emitting the two ARIA
 * attributes that make the association explicit.
 *
 * The convention this relies on: an input's `id` equals its error key, which
 * equals the DTO property the backend reports in `errors[].field`. That single
 * shared name is what lets a server rejection travel all the way to the right
 * input without a translation table.
 */

export type FieldErrorMap = Record<string, string | undefined>

/**
 * Why an id namespace exists.
 *
 * The convention is that an input's DOM id equals the error key equals the DTO
 * property. That breaks the moment two forms on one page post to endpoints
 * sharing a property name — the Loan Details page has a Disburse form and a
 * Record Repayment form, and *both* DTOs call the field `amount`. Two elements
 * with `id="amount"` is invalid HTML, `getElementById` returns whichever came
 * first, and focus lands in the wrong form.
 *
 * `idPrefix` namespaces the DOM id only. The error KEY stays the bare wire name
 * (`amount`), because that is what the server reports and what the map must be
 * addressable by.
 */
export function fieldDomId(field: string, idPrefix?: string): string {
  return idPrefix ? `${idPrefix}-${field}` : field
}

/** Stable DOM id for a field's error text. */
export function fieldErrorId(field: string, idPrefix?: string): string {
  return `${fieldDomId(field, idPrefix)}-error`
}

type FieldErrorProps = {
  /**
   * The field's wire name — the key in the error map, and (via `fieldDomId`)
   * the input's `id`. Optional only so legacy call sites keep compiling;
   * without it the error renders but is not announced as belonging to any
   * input.
   */
  field?: string
  /** Must match the `idPrefix` given to the matching `fieldErrorAttrs` call. */
  idPrefix?: string
  message?: string
}

export function FieldError({ field, idPrefix, message }: FieldErrorProps) {
  if (!message) return null
  return (
    <p id={field ? fieldErrorId(field, idPrefix) : undefined} className="field-error" role="alert">
      {message}
    </p>
  )
}

/**
 * Spread onto the input/select/textarea, alongside `id={fieldDomId(...)}`:
 *
 *   <input id="monthlyRevenue" {...fieldErrorAttrs('monthlyRevenue', errors.monthlyRevenue)} />
 *
 * Returns an empty object when valid, so nothing is emitted on the happy path —
 * a permanently-present `aria-invalid="false"` is noise, and `aria-describedby`
 * pointing at an element that isn't rendered is a broken reference.
 */
export function fieldErrorAttrs(
  field: string,
  message?: string,
  idPrefix?: string,
): { 'aria-invalid'?: true; 'aria-describedby'?: string } {
  if (!message) return {}
  return { 'aria-invalid': true, 'aria-describedby': fieldErrorId(field, idPrefix) }
}

/**
 * Move focus to the first invalid field, so a rejected submit doesn't leave the
 * user staring at an unchanged screen with the real problem scrolled off above.
 *
 * "First" means first in *document* order, not first in the errors object.
 * Object key order follows whatever sequence `validate()` happened to check in,
 * which drifts from the visual layout as forms grow — and focus landing on a
 * field below the one the user should fix first is worse than not moving it.
 *
 * Safe to call synchronously right after setState: it resolves elements by
 * their static `id`, which is already in the DOM, rather than by `aria-invalid`
 * which React has not committed yet.
 *
 * Returns true if focus moved — callers can fall back to a banner if not.
 */
export function focusFirstInvalidField(errors: FieldErrorMap, idPrefix?: string): boolean {
  if (typeof document === 'undefined') return false

  const elements = Object.keys(errors)
    .filter((field) => errors[field])
    .map((field) => document.getElementById(fieldDomId(field, idPrefix)))
    .filter((el): el is HTMLElement => el !== null)

  if (elements.length === 0) return false

  const first = elements.reduce((earliest, candidate) =>
    // DOCUMENT_POSITION_PRECEDING (2) — candidate comes before earliest.
    earliest.compareDocumentPosition(candidate) & Node.DOCUMENT_POSITION_PRECEDING
      ? candidate
      : earliest,
  )

  first.focus({ preventScroll: true })
  first.scrollIntoView({ behavior: 'smooth', block: 'center' })
  return true
}
