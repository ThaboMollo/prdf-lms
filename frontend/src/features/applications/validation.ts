import { z } from 'zod'

export const createApplicationSchema = z.object({
  businessName: z.string().trim().min(2, 'Business name is required.'),
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
