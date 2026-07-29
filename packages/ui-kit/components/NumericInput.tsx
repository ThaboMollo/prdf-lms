/**
 * A numeric input that actually holds a number (docs/validation-spec.md §D).
 *
 * `type="number"` is not a numeric input. It permits `e`, `E`, `+` and `-`
 * anywhere in the field, accepts pasted text, and — the part that causes real
 * damage — reports `value === ''` for any content it considers invalid. So
 * `<input type="number">` containing the text `1e5` hands you an empty string,
 * and the app's `Number(e.target.value)` turns that into **0**. On
 * `requestedAmount` that is a silent, plausible-looking wrong number rather
 * than a visible error.
 *
 * This component:
 *   - filters input to the shape the mode allows, so bad characters never
 *     enter the field rather than being rejected afterwards;
 *   - emits `number | null` — never `NaN`, never `''`, never a coerced 0;
 *   - keeps the raw text in local state while typing, so a half-typed `1.`
 *     or a lone `-` is not rewritten under the user's cursor;
 *   - shows thousands separators for `currency`, but only while unfocused —
 *     reformatting mid-keystroke moves the caret and is worse than no
 *     grouping at all.
 *
 * The parsing/formatting logic is exported separately from the component so it
 * can be tested without a DOM.
 */
import { useState } from 'react'
import { fieldErrorAttrs, fieldDomId } from './FieldError'

export type NumericMode = 'integer' | 'decimal' | 'currency'

/** Non-breaking space, matching client-ui's formatRand output. */
const GROUP_SEPARATOR = ' '

/**
 * Strip everything that cannot belong in a number of this mode.
 *
 * A typed comma becomes a decimal point: en-ZA formats numbers as
 * `1 234 567,89`, so a South African user reaching for the decimal separator
 * may well type `,`. Silently dropping it would turn `1,5` into `15` — off by
 * a factor of ten, with no indication anything happened.
 *
 * Grouping separators (spaces, including the non-breaking ones this component
 * emits) are dropped, so a formatted value can be re-edited.
 */
export function sanitizeNumericInput(raw: string, mode: NumericMode): string {
  let text = raw.replace(/[\s ]/g, '')

  if (mode === 'integer') {
    return text.replace(/[^0-9]/g, '')
  }

  text = text.replace(/,/g, '.').replace(/[^0-9.]/g, '')

  // Keep only the first decimal point; later ones are dropped rather than
  // truncating the value, so `1.2.3` becomes `1.23` rather than `1.2`.
  const firstDot = text.indexOf('.')
  if (firstDot !== -1) {
    text = text.slice(0, firstDot + 1) + text.slice(firstDot + 1).replace(/\./g, '')
  }

  // Money has no meaningful third decimal.
  if (mode === 'currency' && firstDot !== -1) {
    const [whole, fraction = ''] = text.split('.')
    text = `${whole}.${fraction.slice(0, 2)}`
  }

  return text
}

/**
 * Parse the field's text into the value the form holds.
 *
 * Returns null for empty or for anything that isn't a complete number (`.`,
 * `1.` mid-typing). Null means "no value", which is distinct from 0 — a blank
 * amount field is not a request to borrow nothing.
 */
export function parseNumericValue(text: string, mode: NumericMode): number | null {
  const clean = sanitizeNumericInput(text, mode)
  if (clean === '' || clean === '.') return null

  const parsed = Number(clean)
  if (!Number.isFinite(parsed)) return null
  if (mode === 'integer' && !Number.isInteger(parsed)) return null

  return parsed
}

/** Display form. Only `currency` gets thousands separators. */
export function formatNumericValue(value: number | null, mode: NumericMode): string {
  if (value === null || !Number.isFinite(value)) return ''
  if (mode !== 'currency') return String(value)

  const [whole, fraction] = String(value).split('.')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, GROUP_SEPARATOR)
  return fraction ? `${grouped}.${fraction}` : grouped
}

type NumericInputProps = {
  /** Wire name — the error-map key and, via fieldDomId, the DOM id. */
  field: string
  value: number | null
  onChange: (value: number | null) => void
  mode?: NumericMode
  /** Namespaces the DOM id when two forms on a page share a field name. */
  idPrefix?: string
  /** Message for this field, if any — drives aria-invalid/aria-describedby. */
  error?: string
  min?: number
  max?: number
  placeholder?: string
  disabled?: boolean
  required?: boolean
  autoComplete?: string
  className?: string
}

export function NumericInput({
  field,
  value,
  onChange,
  mode = 'decimal',
  idPrefix,
  error,
  min,
  max,
  placeholder,
  disabled,
  required,
  autoComplete,
  className,
}: NumericInputProps) {
  // `text` is the in-progress edit and is authoritative ONLY while focused.
  // Unfocused, the field renders from `value` directly, so an external change
  // (hydrating a saved draft, a reset) needs no synchronising effect — and
  // while focused it must not, since the parent is echoing back the value this
  // field just emitted. A typed `1.` parses to 1, which would format back to
  // "1" and delete the decimal point under the user's cursor.
  const [text, setText] = useState('')
  const [focused, setFocused] = useState(false)

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const next = sanitizeNumericInput(event.target.value, mode)
    setText(next)
    onChange(parseNumericValue(next, mode))
  }

  return (
    <input
      id={fieldDomId(field, idPrefix)}
      {...fieldErrorAttrs(field, error, idPrefix)}
      // `text`, not `number`: type="number" is what reports '' for invalid
      // content, which is the failure mode this component exists to remove.
      // inputMode still gives mobile the numeric keypad.
      type="text"
      inputMode={mode === 'integer' ? 'numeric' : 'decimal'}
      value={focused ? text : formatNumericValue(value, mode)}
      onChange={handleChange}
      onFocus={() => {
        setFocused(true)
        // Drop grouping while editing so the caret isn't jumped by separators
        // being inserted and removed as the number grows.
        setText(value === null ? '' : String(value))
      }}
      onBlur={() => setFocused(false)}
      // Advisory only — these mirror the schema so the browser can hint, but
      // the range is enforced by the shared constraints on both sides.
      min={min}
      max={max}
      placeholder={placeholder}
      disabled={disabled}
      required={required}
      autoComplete={autoComplete}
      className={className}
    />
  )
}
