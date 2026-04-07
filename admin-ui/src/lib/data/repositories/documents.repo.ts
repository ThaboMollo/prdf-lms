import type { ApplicationDocument, DocumentVerificationStatus, PresignUploadResponse } from '../../api'
import { createSupabaseDocumentsAdapter } from '../adapters/supabase/documents.supabase'

export type DocumentsRepository = {
  getDocuments: (applicationId: string) => Promise<ApplicationDocument[]>
  uploadDocument: (applicationId: string, docType: string, file: File, status?: string) => Promise<ApplicationDocument>
  getDocumentUrl: (applicationId: string, storagePath: string, expiresInSeconds?: number) => Promise<string>
  presignUpload: (
    applicationId: string,
    docType: string,
    fileName: string,
    contentType?: string
  ) => Promise<PresignUploadResponse>
  confirmUpload: (
    applicationId: string,
    docType: string,
    storagePath: string,
    status?: string
  ) => Promise<ApplicationDocument>
  verifyDocument: (
    applicationId: string,
    documentId: string,
    status: DocumentVerificationStatus,
    note?: string
  ) => Promise<void>
}

export function createDocumentsRepository(accessToken: string): DocumentsRepository {
  // Document files must flow directly through Supabase storage.
  return createSupabaseDocumentsAdapter(accessToken)
}
