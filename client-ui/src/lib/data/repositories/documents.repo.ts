import type { ApplicationDocument, DocumentVerificationStatus, PresignUploadResponse } from '../../api'
import { getDataProvider } from '../../config/dataProvider'
import { createApiDocumentsAdapter } from '../adapters/api/documents.api'
import { createSupabaseDocumentsAdapter } from '../adapters/supabase/documents.supabase'

export type DocumentsRepository = {
  getDocuments: (applicationId: string) => Promise<ApplicationDocument[]>
  uploadDocument: (applicationId: string, docType: string, file: File, status?: string) => Promise<ApplicationDocument>
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
  // Remove a document (storage object + row). Client-allowed only on own drafts.
  deleteDocument: (applicationId: string, documentId: string, storagePath: string) => Promise<void>
  // A short-lived signed URL for viewing/downloading a stored document.
  createSignedUrl: (storagePath: string, expiresInSeconds?: number) => Promise<string>
}

export function createDocumentsRepository(accessToken: string): DocumentsRepository {
  const provider = getDataProvider()
  if (provider === 'api') {
    return createApiDocumentsAdapter(accessToken)
  }

  return createSupabaseDocumentsAdapter(accessToken)
}
