// Consent checklist shown before a loan application is saved/submitted.
//
// DRAFT WORDING — pending PRDF legal / compliance review. Bump CONSENT_VERSION
// whenever any prompt below changes so stored consent records stay traceable.

export const CONSENT_VERSION = '2026-07-01'

export type ConsentSection = 'POPIA' | 'Policy' | 'Terms'

export type ConsentItem = {
  key: string
  section: ConsentSection
  prompt: string
}

export const CONSENT_SECTIONS: { id: ConsentSection; title: string }[] = [
  { id: 'POPIA', title: 'Data privacy (POPIA)' },
  { id: 'Policy', title: 'Policy acknowledgements' },
  { id: 'Terms', title: 'Terms & Conditions' },
]

export const CONSENT_ITEMS: ConsentItem[] = [
  // POPIA / data processing
  {
    key: 'popia_processing',
    section: 'POPIA',
    prompt:
      'I consent to PRDF collecting, processing and storing my personal and business information for the purpose of assessing this application.',
  },
  {
    key: 'popia_credit_check',
    section: 'POPIA',
    prompt:
      'I consent to PRDF verifying my information with credit bureaus and assessing my credit worthiness.',
  },
  {
    key: 'popia_retention',
    section: 'POPIA',
    prompt:
      'I understand PRDF will retain my information for the periods required by law and that I may request access to or correction of my information.',
  },
  // Policy acknowledgements
  {
    key: 'policy_documentation',
    section: 'Policy',
    prompt: 'I understand the documentation I am required to submit together with my application.',
  },
  {
    key: 'policy_internal_approval',
    section: 'Policy',
    prompt:
      'I understand my application is subject to internal approval, and that submitting or signing it does not mean it has been approved.',
  },
  {
    key: 'policy_outcome_letter',
    section: 'Policy',
    prompt: 'I understand that if my application is unsuccessful, PRDF will issue a letter with the reason.',
  },
  {
    key: 'policy_clause_meaning',
    section: 'Policy',
    prompt: 'I understand the meaning of each clause in any agreement I sign with PRDF.',
  },
  {
    key: 'policy_insure_assets',
    section: 'Policy',
    prompt: 'I understand I am obligated to insure any assets purchased with the loan.',
  },
  {
    key: 'policy_direct_debit',
    section: 'Policy',
    prompt: 'I understand repayment of my loan will be collected via a direct debit order.',
  },
  // Terms & Conditions
  {
    key: 'terms_accurate_info',
    section: 'Terms',
    prompt: 'I confirm that all the information I have provided is true and accurate.',
  },
  {
    key: 'terms_accept',
    section: 'Terms',
    prompt: 'I have read and agree to the PRDF Terms & Conditions and Privacy Policy.',
  },
]

export type ConsentAnswer = {
  key: string
  section: ConsentSection
  prompt: string
  answer: boolean
}

export type ConsentPayload = {
  version: string
  items: ConsentAnswer[]
}
