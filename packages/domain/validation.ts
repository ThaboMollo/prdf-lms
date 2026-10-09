import { z } from 'zod'
import { LIMITS, countWords } from './constraints'

// Authoritative copy — matches admin-ui's live-enforced staff-assisted-creation
// flow (businessName required). client-ui's dead ApplicationsPage.tsx had a
// divergent, optional-businessName copy of this schema; that page is deleted
// as part of this same pass.
export const createApplicationSchema = z.object({
  businessName: z.string().trim().min(2, 'Business name is required.'),
  registrationNo: z.string().trim().optional(),
  address: z.string().trim().optional(),
  requestedAmount: z.coerce.number().positive('Requested amount must be greater than 0.'),
  termMonths: z.coerce.number().int().positive('Term must be greater than 0 months.'),
  purpose: z
    .string()
    .trim()
    .refine(
      (v) => countWords(v) >= LIMITS.purpose.minWords,
      `Purpose must be at least ${LIMITS.purpose.minWords} words long.`,
    ),
})

export const uploadSchema = z.object({
  docType: z.string().trim().min(2, 'Document type is required.'),
})

export const statusChangeSchema = z.object({
  toStatus: z.enum([
    'Submitted',
    'UnderReview',
    'InfoRequested',
    'Approved',
    'Rejected',
    'Disbursed',
    'InRepayment',
    'Closed',
  ]),
  note: z.string().trim().max(1000).optional(),
})

export type CreateApplicationFormData = z.infer<typeof createApplicationSchema>
export type UploadFormData = z.infer<typeof uploadSchema>
export type StatusChangeFormData = z.infer<typeof statusChangeSchema>
