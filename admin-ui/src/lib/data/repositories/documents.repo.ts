import type { ApplicationDocument, DocumentVerificationStatus, PresignUploadResponse } from '../../api'
import { createApiDocumentsAdapter } from '../adapters/api/documents.api'

export type DocumentsRepository = {
  getDocuments: (applicationId: string) => Promise<ApplicationDocument[]>
  uploadDocument: (applicationId: string, docType: string, file: File, status?: string) => Promise<ApplicationDocument>
  getDocumentUrl: (applicationId: string, documentId: string) => Promise<string>
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
  return createApiDocumentsAdapter(accessToken)
}
