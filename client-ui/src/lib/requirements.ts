/**
 * Display labels/hints for document types. Which types are actually
 * required, and whether multiple files are allowed, now comes from
 * document_requirements (see packages/client-core/useLoanProduct.ts's useDocumentRequirements) —
 * this file is presentation-only.
 *
 * This consolidates what used to be three independently-drifted copies:
 * this file, ApplyPage.tsx's DOC_SLOTS, and admin-ui/ApplicationsPage.tsx's
 * inline array — each with different label text. There is exactly one
 * label per doc_type now.
 */
export const DOCUMENT_LABELS: Record<string, { label: string; hint: string; expectedCount?: number }> = {
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
    label: 'Financial Statements',
    hint: 'Latest annual financials or management accounts',
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

export function getDocumentLabel(docType: string): string {
  return DOCUMENT_LABELS[docType]?.label ?? docType
}

/**
 * How many files a multi-file slot is expected to hold.
 *
 * Advisory, not a rule: `document_requirements.allows_multiple` is a boolean,
 * so the database cannot express "three of these". A short count therefore
 * warns on the way to Review rather than blocking submission — an applicant
 * whose bank consolidates three months into one PDF is not in breach, and
 * hard-blocking them would be wrong. Undefined means "one file is enough".
 */
export function expectedFileCount(docType: string): number | undefined {
  return DOCUMENT_LABELS[docType]?.expectedCount
}
