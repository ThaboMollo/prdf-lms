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
  }
] as const

export type RequiredDocumentType = typeof requiredDocuments[number]['type']

export const requiredDocumentTypes = requiredDocuments.map((doc) => doc.type)

export function getDocumentLabel(docType: string) {
  return requiredDocuments.find((doc) => doc.type === docType)?.label ?? docType
}
