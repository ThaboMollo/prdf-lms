/**
 * One error-state shape for a form, holding client and server errors together
 * (docs/validation-spec.md §C2).
 *
 * The problem this solves: a field rejected by the local zod schema rendered
 * one way (inline, under the input) and the same field rejected by the API
 * rendered another (a banner at the bottom, if it showed at all). Same field,
 * same mistake, two different experiences — and the server-side one was the
 * less helpful of the two despite being the authoritative check.
 *
 * Here both paths land in the same `fieldErrors` map, so a field renders
 * identically regardless of which side rejected it.
 *
 * The decision logic is exported as pure functions and the hook is thin glue
 * over them. That is deliberate: the interesting behaviour (what becomes a
 * field error, what becomes a banner) is then testable without a DOM.
 */
import { useCallback, useRef, useState } from 'react'
import { ApiError } from '../../domain/api-error'
import { focusFirstInvalidField, type FieldErrorMap } from '../components/FieldError'

export { FieldError, fieldErrorAttrs, fieldDomId, fieldErrorId } from '../components/FieldError'
export type { FieldErrorMap } from '../components/FieldError'

/**
 * zod's error shape, structurally typed rather than imported.
 *
 * ui-kit carries no dependencies of its own — that is what stopped a duplicate
 * React being bundled, and the same reasoning applies to zod. Both apps pin
 * zod ^4, and this is the only part of its surface we touch.
 */
export type ZodLikeIssue = { path: ReadonlyArray<PropertyKey>; message: string }
export type ZodLikeError = { issues: ReadonlyArray<ZodLikeIssue> }

/**
 * Flatten a zod error into the same map shape the server path produces.
 *
 * Paths are joined with '.' to match the dotted paths
 * `flattenValidationErrors` emits on the backend (`consent.items.0.answer`), so
 * one key format addresses a field no matter which validator rejected it.
 *
 * First issue per field wins, matching the backend's rule — a single bad number
 * can violate three constraints at once, and three messages under one input is
 * noise.
 */
export function fieldErrorsFromZod(error: ZodLikeError): FieldErrorMap {
  const errors: FieldErrorMap = {}

  for (const issue of error.issues) {
    // A schema-level refinement has an empty path and belongs to no single
    // input; it is surfaced as a form-level error instead of being dropped
    // onto a field named ''.
    if (issue.path.length === 0) continue

    const field = issue.path.map(String).join('.')
    if (!(field in errors)) errors[field] = issue.message
  }

  return errors
}

/** Refinements with no path — form-level, not attributable to an input. */
export function formErrorFromZod(error: ZodLikeError): string | null {
  const rootIssue = error.issues.find((issue) => issue.path.length === 0)
  return rootIssue ? rootIssue.message : null
}

/**
 * Field errors carried by a thrown value, if any.
 *
 * Anything that is not an ApiError with attributed fields yields {} — a network
 * failure or a 500 is not the user's input being wrong, and guessing a field
 * for it would point them at a healthy input.
 */
export function fieldErrorsFromThrown(error: unknown): FieldErrorMap {
  return error instanceof ApiError && error.hasFieldErrors ? error.fieldMap() : {}
}

/**
 * What belongs in the form-level banner.
 *
 * `focused` is whether we managed to move focus to one of the offending
 * inputs. If we did, the banner stays empty: the message is already visible
 * against the field, and repeating it above is redundant noise.
 *
 * If we did not — because the field isn't mounted, as on the apply wizard's
 * review step where the inputs live on earlier steps — the banner is the only
 * place the user will see it, so it must carry the message.
 */
export function formErrorFromThrown(error: unknown, focused: boolean): string | null {
  if (focused) return null
  if (error instanceof Error) return error.message
  return 'Something went wrong. Please try again.'
}

export type UseFormErrors = {
  /** Field name -> message. Merged from both the local schema and the server. */
  fieldErrors: FieldErrorMap
  /** Whatever could not be attributed to a field. */
  formError: string | null
  submitting: boolean
  /**
   * Validate, then run the request. Resolves to the request's value on success
   * and `undefined` on any failure — so callers branch on the result rather
   * than duplicating error handling.
   */
  submit: <R>(
    request: () => Promise<R>,
    options?: { validate?: () => FieldErrorMap },
  ) => Promise<R | undefined>
  /** Drop one field's error — call from its onChange. */
  clearField: (field: string) => void
  /** Replace the whole map, for forms driving validation themselves. */
  setFieldErrors: (errors: FieldErrorMap) => void
  reset: () => void
  /** Pass to fieldErrorAttrs/FieldError so ids match what focus looks up. */
  idPrefix?: string
}

/**
 * @param options.idPrefix Namespaces DOM ids when more than one form shares a
 *   page and their DTOs share a property name — see fieldDomId. Error KEYS are
 *   unaffected; they stay the bare wire name the server reports.
 */
export function useFormErrors(options?: { idPrefix?: string }): UseFormErrors {
  const idPrefix = options?.idPrefix
  const [fieldErrors, setFieldErrors] = useState<FieldErrorMap>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // A ref, not the state value: `submit` must see the in-flight status
  // immediately. Reading `submitting` would see the value captured when the
  // callback was created, so a double-click would fire two requests — on a
  // disbursement or a repayment that means paying twice.
  const inFlight = useRef(false)

  const clearField = useCallback((field: string) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
  }, [])

  const reset = useCallback(() => {
    setFieldErrors({})
    setFormError(null)
  }, [])

  const submit = useCallback(async <R,>(
    request: () => Promise<R>,
    options?: { validate?: () => FieldErrorMap },
  ): Promise<R | undefined> => {
    if (inFlight.current) return undefined

    setFormError(null)

    const localErrors = options?.validate?.() ?? {}
    // A key explicitly set to undefined is not an error — cleared fields leave
    // those behind, and treating them as failures would block every submit.
    if (Object.values(localErrors).some(Boolean)) {
      setFieldErrors(localErrors)
      focusFirstInvalidField(localErrors, idPrefix)
      return undefined
    }

    setFieldErrors({})
    inFlight.current = true
    setSubmitting(true)

    try {
      return await request()
    } catch (error) {
      const serverErrors = fieldErrorsFromThrown(error)
      setFieldErrors(serverErrors)
      // Focus before deciding the banner: whether we could point at an input
      // is what determines if the banner is needed at all.
      const focused = focusFirstInvalidField(serverErrors, idPrefix)
      setFormError(formErrorFromThrown(error, focused))
      return undefined
    } finally {
      inFlight.current = false
      setSubmitting(false)
    }
  }, [idPrefix])

  return { fieldErrors, formError, submitting, submit, clearField, setFieldErrors, reset, idPrefix }
}
