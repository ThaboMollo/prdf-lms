/**
 * Display labels for document types. Which types are actually required now
 * comes from document_requirements (see lib/loanProduct.ts) — this file is
 * presentation-only. Mirrors client-ui/src/lib/requirements.ts.
 */
export const DOCUMENT_LABELS: Record<string, string> = {
  IDDocument: 'ID Document',
  ProofOfAddress: 'Proof of Address',
  BusinessRegistration: 'Company Registration (CIPC)',
  TaxClearance: 'Tax Clearance',
  BankStatement: 'Bank Statements (3 months)',
  Financials: 'Financial Statements',
  VendorQuotation: 'Vendor Quotations (3x)',
  RfqSupplierSpec: 'Central Supplier Database (CSD) Reports',
  PurchaseOrder: 'Purchase Order / Short Term Contracts (Not greater than 3 years)',
  TradeReference: 'Trade Reference',
}

export function getDocumentLabel(docType: string): string {
  return DOCUMENT_LABELS[docType] ?? docType
}
