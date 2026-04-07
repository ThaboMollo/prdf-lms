import { z } from 'zod'

// ----------------------------------------------------------------
// Wizard step schemas (5-step application flow)
// ----------------------------------------------------------------

export const step1Schema = z.object({
  businessName: z.string().trim().min(2, 'Business name is required'),
  registrationNo: z.string().trim().min(4, 'Registration number is required'),
  industry: z.string().min(1, 'Please select an industry'),
  address: z.string().trim().min(5, 'Address is required'),
  province: z.string().min(1, 'Please select a province'),
})

export const step2Schema = z.object({
  monthlyRevenue: z.coerce.number().positive('Monthly revenue must be greater than 0'),
  yearsInOperation: z.coerce.number().min(0, 'Cannot be negative').max(100),
  numberOfEmployees: z.coerce.number().int().min(1, 'Must have at least 1 employee'),
  bankName: z.string().trim().min(2, 'Bank name is required'),
})

export const step3Schema = z.object({
  requestedAmount: z.coerce.number().min(10000, 'Minimum loan amount is R10,000').max(500000, 'Maximum loan amount is R500,000'),
  termMonths: z.coerce.number().int().min(1, 'Minimum 1 month').max(24, 'Maximum 24 months'),
  purpose: z.string().trim().min(5, 'Please describe the loan purpose (at least 5 characters)'),
  loanPurposeCategory: z.string().min(1, 'Please select a purpose category'),
})

export const step4Schema = z.object({
  cipcCert: z.any().refine((v): v is File => v instanceof File, {
    message: 'CIPC certificate is required',
  }),
  bankStatements: z.array(z.any()).min(1, 'At least one bank statement is required'),
  financials: z.any().optional(),
})

export const step5Schema = z.object({
  termsAccepted: z.boolean().refine((v) => v === true, {
    message: 'You must accept the terms and conditions',
  }),
})

export type Step1Data = z.infer<typeof step1Schema>
export type Step2Data = z.infer<typeof step2Schema>
export type Step3Data = z.infer<typeof step3Schema>
export type Step4Data = { cipcCert: File | null; bankStatements: File[]; financials: File | null }
export type Step5Data = { termsAccepted: boolean }

export type WizardFormState = {
  step1: Step1Data | null
  step2: Step2Data | null
  step3: Step3Data | null
  step4: Step4Data | null
  step5: Step5Data
}

// ----------------------------------------------------------------
// Legacy schema — kept for ApplicationsPage.tsx compatibility
// ----------------------------------------------------------------
export const createApplicationSchema = z.object({
  businessName: z.string().trim().optional(),
  registrationNo: z.string().trim().optional(),
  address: z.string().trim().optional(),
  requestedAmount: z.coerce.number().positive('Requested amount must be greater than 0.'),
  termMonths: z.coerce.number().int().positive('Term must be greater than 0 months.'),
  purpose: z.string().trim().min(5, 'Purpose must be at least 5 characters long.')
})

export const uploadSchema = z.object({
  docType: z.string().trim().min(2, 'Document type is required.')
})

export const statusChangeSchema = z.object({
  toStatus: z.enum([
    'Withdrawn',
    'Submitted',
    'UnderReview',
    'InfoRequested',
    'Approved',
    'Rejected',
    'Disbursed',
    'InRepayment',
    'Closed'
  ]),
  note: z.string().trim().max(1000).optional()
})

export type CreateApplicationFormData = z.infer<typeof createApplicationSchema>
export type UploadFormData = z.infer<typeof uploadSchema>
export type StatusChangeFormData = z.infer<typeof statusChangeSchema>
