/**
 * Typed API errors that preserve field attribution
 * (docs/validation-spec.md §2, workstream C1).
 *
 * Both apps previously did:
 *
 *   throw new Error(`API ${response.status}: ${await response.text()}`)
 *
 * — stringifying the whole JSON body into a message. That was the last of
 * three places where field attribution was destroyed: the backend knew which
 * input was wrong, said so in `errors`, and the frontend threw the structure
 * away before anything could read it. Every form could therefore only ever
 * show a banner.
 *
 * Framework-free by design so both apps and any future one share it, matching
 * the rest of packages/domain.
 */

export interface FieldError {
  /** Wire name — the DTO property, e.g. `requestedAmount`. Not a label. */
  field: string
  /** User-facing prose, safe to render verbatim. */
  message: string
  /** Stable machine token (`required`, `min`, `type`, …). */
  code: string
}

export class ApiError extends Error {
  readonly status: number
  readonly errors: FieldError[]

  constructor(status: number, message: string, errors: FieldError[] = []) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.errors = errors
    // Required for `instanceof` to work when targeting ES5-era output.
    Object.setPrototypeOf(this, ApiError.prototype)
  }

  /** True when the server attributed the failure to specific inputs. */
  get hasFieldErrors(): boolean {
    return this.errors.length > 0
  }

  /**
   * Field name → first message, ready to merge straight into a form's error
   * state. First wins: the backend already reports one constraint per field,
   * but a defensive first-wins keeps this total.
   */
  fieldMap(): Record<string, string> {
    const map: Record<string, string> = {}
    for (const error of this.errors) {
      if (!(error.field in map)) map[error.field] = error.message
    }
    return map
  }
}

/**
 * Parse a fetch Response, throwing ApiError with structure intact.
 *
 * Deliberately tolerant of a non-JSON body: an upstream proxy, a 502 from the
 * platform, or an HTML error page must still produce a usable ApiError rather
 * than a JSON parse exception that masks the real status.
 */
export async function parseApiResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const raw = await response.text().catch(() => '')

    let message = response.statusText || `Request failed (${response.status})`
    let errors: FieldError[] = []

    if (raw) {
      try {
        const body = JSON.parse(raw) as { message?: unknown; errors?: unknown }
        if (typeof body.message === 'string' && body.message) {
          message = body.message
        } else if (Array.isArray(body.message)) {
          // NestJS's default validation shape, in case any route still uses it.
          message = body.message.join(', ')
        }
        if (Array.isArray(body.errors)) {
          errors = body.errors.filter(
            (e): e is FieldError =>
              !!e && typeof e === 'object' && typeof (e as FieldError).field === 'string',
          )
        }
      } catch {
        // Not JSON — keep the raw text, truncated so an HTML error page doesn't
        // end up rendered into a toast.
        message = raw.slice(0, 200)
      }
    }

    throw new ApiError(response.status, message, errors)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
}
