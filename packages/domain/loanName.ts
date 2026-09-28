/**
 * The display name for a loan application (and for the loan it becomes):
 *
 *     {business name} {applicant first name} {application date}
 *     e.g. "OVO Thabo 27 Sep 2026"
 *
 * Derived, never stored. Keeping it a pure function of three fields the
 * database already owns means no migration, no backfill, and no possibility
 * of a stored name drifting from the client record it describes — the same
 * reasoning that put DOCUMENT_LABELS in one place after three copies had
 * drifted apart.
 *
 * It replaces `purpose || "Application <id8>"`, which was duplicated across
 * nine call sites in the two UIs and rendered a loan as whatever free text
 * the applicant happened to type into "tell us more about how you'll use the
 * funds".
 *
 * A loan inherits its application's name, so My Loans, the applications list
 * and the admin case view all say the same thing about the same deal.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

export type LoanNameInput = {
  /** clients.business_name */
  businessName?: string | null
  /** profiles.full_name — the first token becomes the applicant's first name. */
  applicantFullName?: string | null
  /** loan_applications.created_at. A draft has no submitted_at, and "date of
   *  application" reads as when it was started. */
  date?: string | Date | null
}

/**
 * "27 Sep 2026".
 *
 * Hand-rolled rather than Intl.DateTimeFormat('en-ZA'): ICU has shipped both
 * "Sep" and "Sept" for that locale depending on version, and a name that
 * changes shape with the runtime is not a name.
 */
export function formatLoanNameDate(value: string | Date | null | undefined): string | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`
}

/**
 * The applicant's first name, or null when there isn't a usable one.
 *
 * profiles has only full_name — there is no first_name column — so this takes
 * the leading token. Staff-created ("assisted") clients fall back to the
 * invited email address as their full_name (see ClientsService.prepareUserProfile),
 * and "OVO mollo.t.mponya@gmail.com 27 Sep 2026" is worse than no name at all,
 * so an email is rejected rather than split.
 */
export function applicantFirstName(fullName: string | null | undefined): string | null {
  const trimmed = fullName?.trim()
  if (!trimmed) return null
  if (trimmed.includes('@')) return null
  const [first] = trimmed.split(/\s+/)
  return first || null
}

export function buildLoanName({ businessName, applicantFullName, date }: LoanNameInput): string {
  // Collapse internal runs of whitespace: a pasted business name with a double
  // space would otherwise open a visible gap in the middle of the name.
  const business = businessName?.trim().replace(/\s+/g, ' ') || null
  const first = applicantFirstName(applicantFullName)
  const day = formatLoanNameDate(date)

  const parts = [business, first, day].filter((part): part is string => Boolean(part))

  // With no business name the remaining parts do not read as a name on their
  // own ("Thabo 27 Sep 2026", or bare "27 Sep 2026"), so they get a noun.
  if (!business) parts.unshift('Loan Application')

  return parts.join(' ')
}
