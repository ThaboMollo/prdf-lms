import { z } from 'zod'
import {
  GENDERS,
  INDUSTRIES,
  LIMITS,
  SA_PROVINCES,
  SPATIAL_TYPES,
} from '../../../../packages/domain/constraints'

// Rules come from packages/domain/constraints.ts, the same definition the API's
// DTOs are generated from (docs/validation-spec.md workstream B). Before this,
// the client rules and the server rules were written independently and the
// server's were the looser of the two — which made them the ones that mattered,
// since the API is directly callable.

// ----------------------------------------------------------------
// Wizard step schemas (5-step application flow)
// ----------------------------------------------------------------

export const step1Schema = z.object({
  businessName: z.string().trim().min(LIMITS.businessName.minLength, 'Business name is required'),
  registrationNo: z.string().trim().min(LIMITS.registrationNo.minLength, 'Registration number is required'),
  industry: z.enum(INDUSTRIES, { message: 'Please select an industry' }),
  addressLine1: z.string().trim().min(1, 'Address line 1 is required'),
  addressLine2: z.string().default(''),
  city: z.string().trim().min(1, 'City is required'),
  province: z.enum(SA_PROVINCES, { message: 'Please select a province' }),
  country: z.string().trim().min(1, 'Country is required').default('South Africa'),
  gender: z.enum(GENDERS),
  spatialType: z.enum(SPATIAL_TYPES, {
    message: 'Please select where the business operates',
  }),
  isDisabled: z.boolean(),
  isHdp: z.boolean(),
  isRural: z.boolean(),
  isBlackWomenOwned: z.boolean(),
  // z.number, NOT z.coerce.number. NumericInput emits `number | null`, and
  // coerce turns null into 0 — which would record "0% SA ownership" for a field
  // the user simply never filled in. That is BEE data the DFI reports on, so a
  // silent zero is worse than a rejection.
  saCitizenshipPercentage: z
    .number({ message: 'Enter the percentage of SA ownership' })
    .min(LIMITS.saCitizenshipPercentage.min)
    .max(LIMITS.saCitizenshipPercentage.max, 'Cannot exceed 100%'),
  isDirectorOperational: z.boolean(),
  cipcRegistered: z.boolean(),
  sarsTaxPin: z.string().trim().min(LIMITS.sarsTaxPin.minLength, 'Tax pin is required'),
  insolventOrDebtReview: z.boolean()
})

export const step2Schema = z.object({
  monthlyRevenue: z
    .number({ message: 'Enter your average monthly revenue' })
    .positive('Monthly revenue must be greater than 0'),
  // The one that most needs z.number: its minimum is 0, so a coerced null would
  // pass validation as "0 years in operation" rather than being caught.
  yearsInOperation: z
    .number({ message: 'Enter how long the business has operated' })
    .min(LIMITS.yearsInOperation.min, 'Cannot be negative')
    .max(LIMITS.yearsInOperation.max),
  numberOfEmployees: z
    .number({ message: 'Enter the number of employees' })
    .int()
    .min(LIMITS.numberOfEmployees.min, 'Must have at least 1 employee'),
  bankName: z.string().trim().min(LIMITS.bankName.minLength, 'Bank name is required'),
})

/**
 * Amount/term limits now come from loan_products (see packages/client-core/useLoanProduct.ts),
 * not hardcoded constants — so this schema is built per-request rather than
 * defined statically.
 */
export function createStep3Schema(limits: {
  minAmount: number
  maxAmount: number
  minTermMonths: number
  maxTermMonths: number
}) {
  return z.object({
    requestedAmount: z
      .number({ message: 'Enter how much you want to borrow' })
      .min(limits.minAmount, `Minimum loan amount is R${limits.minAmount.toLocaleString('en-ZA')}`)
      .max(limits.maxAmount, `Maximum loan amount is R${limits.maxAmount.toLocaleString('en-ZA')}`),
    termMonths: z
      .number({ message: 'Enter a repayment term' })
      .int()
      .min(limits.minTermMonths, `Minimum ${limits.minTermMonths} month${limits.minTermMonths === 1 ? '' : 's'}`)
      .max(limits.maxTermMonths, `Maximum ${limits.maxTermMonths} months`),
    purpose: z
      .string()
      .trim()
      .min(LIMITS.purpose.minLength, 'Please describe the loan purpose (at least 5 characters)'),
    loanPurposeCategory: z.string().min(1, 'Please select a purpose category'),
  })
}

export type Step3Schema = ReturnType<typeof createStep3Schema>

const requiredFileSchema = (message: string) =>
  z.any().refine((v): v is File => v instanceof File, { message })

export const step4Schema = z.object({
  idDocument: requiredFileSchema('ID document is required'),
  proofOfAddress: requiredFileSchema('Proof of address is required'),
  cipcCert: requiredFileSchema('CIPC certificate is required'),
  taxClearance: requiredFileSchema('Tax clearance document is required'),
  bankStatements: z.array(z.any()).min(1, 'At least one bank statement is required'),
  financials: requiredFileSchema('Financial statements are required'),
})

export const step5Schema = z.object({
  termsAccepted: z.boolean().refine((v) => v === true, {
    message: 'You must accept the terms and conditions',
  }),
})

export type Step1Data = z.infer<typeof step1Schema>
export type Step2Data = z.infer<typeof step2Schema>
export type Step3Data = {
  requestedAmount: number
  termMonths: number
  purpose: string
  loanPurposeCategory: string
}
export type Step4Data = {
  idDocument: File | null
  proofOfAddress: File | null
  cipcCert: File | null
  taxClearance: File | null
  bankStatements: File[]
  financials: File | null
}
export type Step5Data = { termsAccepted: boolean }

export type WizardFormState = {
  step1: Step1Data | null
  step2: Step2Data | null
  step3: Step3Data | null
  step4: Step4Data | null
  step5: Step5Data
}

// ----------------------------------------------------------------
// Shared with admin-ui — see packages/domain/validation.ts
// ----------------------------------------------------------------
export {
  createApplicationSchema,
  uploadSchema,
  statusChangeSchema,
  type CreateApplicationFormData,
  type UploadFormData,
  type StatusChangeFormData,
} from '../../../../packages/domain/validation'
