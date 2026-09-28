import type { ApplicationDetails, ApplicationDocument } from '../../lib/api'
import { DOCUMENT_LABELS, expectedFileCount } from '../../lib/requirements'
import type { Step1Data, Step2Data, Step3Data, WizardFormState } from './validation'

export type ReviewDocRow = {
  docType: string
  label: string
  files: ApplicationDocument[]
  /** Advisory count for multi-file slots (3 bank statements, 3 quotations). */
  expected?: number
  missing: boolean
  short: boolean
}

export type ReviewBusiness = {
  businessName: string
  registrationNo: string
  industry: string
  province: string
  country: string
  spatialType: string
}

export type ReviewFinancials = {
  monthlyRevenue: number | null
  yearsInOperation: number | null
  numberOfEmployees: number | null
  bankName: string
}

export type ApplicationReviewModel = {
  business: ReviewBusiness | null
  financials: ReviewFinancials | null
  loan: { amount: number; term: number; category: string; purpose: string }
  documentRows: ReviewDocRow[]
  docsProvided: number
  docsTotal: number
  missingCount: number
  shortCount: number
}

export type DocSlot = {
  type: string
  label: string
  hint: string
  multiple: boolean
  expectedCount?: number
}

function labelFor(docType: string): string {
  return DOCUMENT_LABELS[docType]?.label ?? docType
}

function buildDocRow(docType: string, files: ApplicationDocument[], includeMissing: boolean): ReviewDocRow {
  const expected = expectedFileCount(docType)
  const missing = includeMissing && files.length === 0
  return {
    docType,
    label: labelFor(docType),
    files,
    expected,
    missing,
    short: files.length > 0 && Boolean(expected && expected > 1 && files.length < expected),
  }
}

/**
 * Rows for the wizard's own review step.
 *
 * `includeMissing` is true here: the applicant is still assembling the set, so
 * a slot with nothing in it is the most important thing on the screen.
 */
function wizardDocRows(documents: ApplicationDocument[], docSlots: DocSlot[]): ReviewDocRow[] {
  return docSlots.map((slot) =>
    buildDocRow(slot.type, documents.filter((d) => d.docType === slot.type), true)
  )
}

/**
 * Rows for a submitted application, read-only.
 *
 * Only what was actually attached is listed, and nothing is marked "Missing":
 * submission already gated on completeness, so a gap here would only mean the
 * required-document list changed afterwards — telling an applicant their
 * approved application is incomplete would be both alarming and untrue.
 */
function submittedDocRows(documents: ApplicationDocument[], docSlots: DocSlot[]): ReviewDocRow[] {
  const byType = new Map<string, ApplicationDocument[]>()
  for (const doc of documents) {
    const list = byType.get(doc.docType) ?? []
    list.push(doc)
    byType.set(doc.docType, list)
  }

  // Ordered by the current requirement list so two applications read the same
  // way, then anything attached under a doc type that list no longer contains.
  const ordered = [
    ...docSlots.map((slot) => slot.type).filter((type) => byType.has(type)),
    ...[...byType.keys()].filter((type) => !docSlots.some((slot) => slot.type === type)),
  ]

  return ordered.map((type) => buildDocRow(type, byType.get(type) ?? [], false))
}

function summarise(rows: ReviewDocRow[], total: number): Pick<ApplicationReviewModel, 'docsProvided' | 'docsTotal' | 'missingCount' | 'shortCount'> {
  return {
    docsProvided: rows.filter((row) => row.files.length > 0).length,
    docsTotal: total,
    missingCount: rows.filter((row) => row.missing).length,
    shortCount: rows.filter((row) => row.short).length,
  }
}

/** The in-progress wizard, reviewed on step 5. */
export function buildReviewModelFromWizard(
  data: WizardFormState,
  documents: ApplicationDocument[],
  docSlots: DocSlot[]
): ApplicationReviewModel {
  const { step1, step2, step3 } = data
  const rows = wizardDocRows(documents, docSlots)

  return {
    business: step1
      ? {
          businessName: step1.businessName,
          registrationNo: step1.registrationNo,
          industry: step1.industry,
          province: step1.province,
          country: step1.country,
          spatialType: step1.spatialType,
        }
      : null,
    financials: step2
      ? {
          monthlyRevenue: step2.monthlyRevenue,
          yearsInOperation: step2.yearsInOperation,
          numberOfEmployees: step2.numberOfEmployees,
          bankName: step2.bankName,
        }
      : null,
    loan: {
      amount: step3?.requestedAmount ?? 0,
      term: step3?.termMonths ?? 0,
      category: step3?.loanPurposeCategory ?? '',
      purpose: step3?.purpose ?? '',
    },
    documentRows: rows,
    ...summarise(rows, docSlots.length),
  }
}

/**
 * Splits the stored `purpose` back into its parts.
 *
 * buildDraftPayload writes it as `${category}: ${free text}`, so an application
 * without a draftState can still show the category separately rather than as a
 * prefix glued onto the description.
 */
function splitPurpose(purpose: string): { category: string; text: string } {
  const at = purpose.indexOf(': ')
  if (at <= 0) return { category: '', text: purpose }
  return { category: purpose.slice(0, at), text: purpose.slice(at + 2) }
}

/**
 * A submitted application, reviewed read-only.
 *
 * draftState first, joined columns second. The wizard writes draftState on
 * every save including the final one at submit (ApplyPage.handleFinalSubmit),
 * so for anything the applicant filled in themselves it is an exact snapshot
 * of what was reviewed and agreed. The clients row is not: the API rewrites it
 * on every draft save, so reading it would let a later application silently
 * change what an earlier one appears to say. It is used only where there is no
 * snapshot — an assisted application captured by staff.
 */
export function buildReviewModelFromApplication(
  details: ApplicationDetails,
  documents: ApplicationDocument[],
  docSlots: DocSlot[]
): ApplicationReviewModel {
  // Cast, not parse: draftState is the wizard's own shape, but it is jsonb and
  // may predate a field, so every read below tolerates undefined.
  const snapshot = (details.draftState ?? {}) as {
    step1?: Partial<Step1Data>
    step2?: Partial<Step2Data>
    step3?: Partial<Step3Data>
  }
  const s1 = snapshot.step1
  const s2 = snapshot.step2
  const s3 = snapshot.step3
  const client = details.clientDetails
  const rows = submittedDocRows(documents, docSlots)
  const purpose = splitPurpose(details.purpose ?? '')

  const business: ReviewBusiness = {
    businessName: s1?.businessName || client?.businessName || '—',
    registrationNo: s1?.registrationNo || client?.registrationNo || '—',
    industry: s1?.industry || client?.industry || '—',
    province: s1?.province || client?.province || '—',
    // clients has no country column, so an assisted application has no country
    // to fall back to.
    country: s1?.country || '—',
    spatialType: s1?.spatialType || client?.spatialType || '—',
  }

  const financials: ReviewFinancials = {
    monthlyRevenue: s2?.monthlyRevenue ?? details.monthlyRevenue ?? null,
    yearsInOperation: s2?.yearsInOperation ?? details.yearsInOperation ?? null,
    numberOfEmployees: s2?.numberOfEmployees ?? details.numberOfEmployees ?? null,
    bankName: s2?.bankName || details.bankName || '—',
  }

  return {
    business,
    financials,
    loan: {
      amount: details.requestedAmount,
      term: details.termMonths,
      category: s3?.loanPurposeCategory || purpose.category || '—',
      purpose: s3?.purpose || purpose.text || '',
    },
    documentRows: rows,
    ...summarise(rows, rows.length),
  }
}
