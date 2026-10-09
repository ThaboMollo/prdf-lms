/**
 * The one place a document type's user-facing wording lives.
 *
 * `document_requirements` stores only `doc_type` keys — there is no label or
 * description column — so the wording has always been hardcoded in the
 * frontends. It was hardcoded *twice*: client-ui/src/lib/requirements.ts with
 * {label, hint, expectedCount}, and admin-ui/src/lib/requirements.ts with a
 * bare Record<string, string>. They had already drifted ("Bank Statements
 * (3 months)" in one, "(last 3 months)" in the other), and renaming the
 * Financials label for PRDF's v1.1 manual review meant editing both by hand —
 * which is exactly how the drift happened the first time.
 *
 * Both apps now read this. admin-ui ignores `hint` and `expectedCount`; that is
 * fine, and cheaper than keeping a second shape in step.
 *
 * Deliberately plain TypeScript with no imports, matching constraints.ts, so it
 * could be mirrored into backend-node the same way if the API ever needs to
 * render a label.
 */

export type DocumentTypeMeta = {
  /** What the applicant and staff both see. */
  label: string
  /** One line under the label on the upload screens. Not shown in admin-ui. */
  hint: string
  /**
   * How many files the label promises. Advisory only — `allows_multiple` is a
   * boolean in the database, so it cannot express "three of these", and a
   * short count warns on the way to Review rather than blocking submission.
   * An applicant whose bank consolidates three months into one PDF is not in
   * breach. Undefined means one file is enough.
   */
  expectedCount?: number
}

export const DOCUMENT_TYPES: Record<string, DocumentTypeMeta> = {
  IDDocument: {
    label: 'ID Document',
    hint: 'Certified copy of the director or applicant identity document',
  },
  ProofOfAddress: {
    label: 'Proof of Address',
    hint: 'Recent proof of business or director address',
  },
  BusinessRegistration: {
    label: 'Company Registration (CIPC)',
    hint: 'CIPC company registration certificate',
  },
  TaxClearance: {
    label: 'Tax Clearance',
    hint: 'SARS tax clearance or tax compliance status document',
  },
  BankStatement: {
    label: 'Bank Statements (last 3 months)',
    hint: 'Upload 3 months of business bank statements',
    expectedCount: 3,
  },
  Financials: {
    label: '2 Years Annual Financial Statements and Management Accounts',
    hint: 'Two years of annual financial statements, plus your latest management accounts',
  },
  VendorQuotation: {
    label: 'Vendor Quotations (3x)',
    hint: 'Three vendor quotations for the goods or services to be funded',
    expectedCount: 3,
  },
  RfqSupplierSpec: {
    label: 'Central Supplier Database (CSD) Reports',
    hint: 'Central Supplier Database (CSD) registration report',
  },
  PurchaseOrder: {
    label: 'Purchase Order / Short Term Contracts (Not greater than 3 years)',
    hint: 'The purchase order itself, including validity details',
  },
  TradeReference: {
    label: 'Trade Reference',
    hint: 'Reference from a business organisation or trade reference',
  },
}

/** Falls back to the raw key, so an unrecognised type still renders something. */
export function getDocumentLabel(docType: string): string {
  return DOCUMENT_TYPES[docType]?.label ?? docType
}

export function getDocumentHint(docType: string): string | undefined {
  return DOCUMENT_TYPES[docType]?.hint
}

export function expectedFileCount(docType: string): number | undefined {
  return DOCUMENT_TYPES[docType]?.expectedCount
}
