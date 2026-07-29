// Shared with the other app — see packages/ui-kit/hooks/useFormErrors.ts
// Re-exports the FieldError helpers too, so a form imports one module.
export {
  useFormErrors,
  fieldErrorsFromZod,
  formErrorFromZod,
  fieldErrorsFromThrown,
  formErrorFromThrown,
  FieldError,
  fieldErrorAttrs,
  fieldDomId,
  fieldErrorId
} from '../../../packages/ui-kit/hooks/useFormErrors'
export type { UseFormErrors, ZodLikeError, ZodLikeIssue, FieldErrorMap } from '../../../packages/ui-kit/hooks/useFormErrors'
