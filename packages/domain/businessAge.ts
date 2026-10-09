/**
 * How long a business has been trading, as one phrase.
 *
 * `years_in_operation` and `months_in_operation` are two columns but one
 * answer, and rendering them as separate rows invites the reader to skim past
 * the months — which is the half that distinguishes a business eight months
 * old from one that has not started trading. That distinction is why PRDF
 * asked for the months field in the first place (v1.1 manual review), so it
 * should not be lost at the point an assessor actually reads it.
 *
 * Shared because the applicant sees this on Step 5 and the assessor sees it on
 * the case overview, and the two disagreeing about what "0 years" means would
 * be worse than either wording on its own.
 *
 * Zero years with months is a real case, so neither half can be assumed
 * present:
 *   (4, 6)       -> "4 years 6 months"
 *   (0, 8)       -> "8 months"
 *   (5, 0)       -> "5 years"
 *   (0, 0)       -> "Less than a month"   (answered, and genuinely new)
 *   (null, null) -> "—"                   (never asked — pre-2026-10 records)
 */
export function formatTimeInOperation(
  years: number | null | undefined,
  months: number | null | undefined,
): string {
  const y = years ?? null
  const m = months ?? null
  if (y == null && m == null) return '—'

  const parts: string[] = []
  if (y != null && y > 0) parts.push(`${y} year${y === 1 ? '' : 's'}`)
  if (m != null && m > 0) parts.push(`${m} month${m === 1 ? '' : 's'}`)

  // Both answered as zero. Saying so beats rendering an empty string, and beats
  // "0 years", which reads as missing data rather than a new business.
  if (!parts.length) return 'Less than a month'
  return parts.join(' ')
}
