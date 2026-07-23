export const requiredDocuments = [
  {
    type: 'IDDocument',
    label: 'ID Document',
    description: 'Director identity document.'
  },
  {
    type: 'ProofOfAddress',
    label: 'Proof of Address',
    description: 'Recent proof of business or director address.'
  },
  {
    type: 'BankStatement',
    label: 'Bank Statements (3 months)',
    description: 'Three months of business bank statements.'
  },
  {
    type: 'BusinessRegistration',
    label: 'Company Registration',
    description: 'CIPC company registration certificate.'
  },
  {
    type: 'TaxClearance',
    label: 'Tax Clearance',
    description: 'SARS tax clearance or tax compliance status document.'
  },
  {
    type: 'Financials',
    label: 'Financial Statements',
    description: 'Latest annual financials or management accounts.'
  },
  {
    type: 'VendorQuotation',
    label: 'Vendor Quotations (3x)',
    description: 'Three vendor quotations for the goods or services to be funded.'
  },
  {
    type: 'RfqSupplierSpec',
    label: 'Central Supplier Database (CSD) Reports',
    description: 'Central Supplier Database (CSD) registration report.'
  },
  {
    type: 'PurchaseOrder',
    label: 'Purchase Order / Short Term Contracts (Not greater than 3 years)',
    description: 'The purchase order itself, including validity details.'
  },
  {
    type: 'TradeReference',
    label: 'Trade Reference',
    description: 'Reference from a business organisation or trade reference.'
  }
] as const

export const allDocuments = requiredDocuments

export type RequiredDocumentType = typeof requiredDocuments[number]['type']

export const requiredDocumentTypes = requiredDocuments.map((doc) => doc.type)

export function getDocumentLabel(docType: string) {
  return allDocuments.find((doc) => doc.type === docType)?.label ?? docType
}
