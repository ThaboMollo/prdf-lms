import { confirmUpload, listDocuments, presignUpload, uploadToSignedUrl, verifyDocument, type ApplicationDocument, type DocumentVerificationStatus } from '../../../api'
import type { DocumentsRepository } from '../../repositories/documents.repo'

export function createApiDocumentsAdapter(accessToken: string): DocumentsRepository {
  return {
    getDocuments: (applicationId: string) => listDocuments(accessToken, applicationId),
    async uploadDocument(applicationId: string, docType: string, file: File, status?: string): Promise<ApplicationDocument> {
      const presign = await presignUpload(accessToken, applicationId, docType, file.name, file.type)
      await uploadToSignedUrl(presign.uploadUrl, file)
      return confirmUpload(accessToken, applicationId, docType, presign.storagePath, status)
    },
    presignUpload: (applicationId: string, docType: string, fileName: string, contentType?: string) =>
      presignUpload(accessToken, applicationId, docType, fileName, contentType),
    confirmUpload: (applicationId: string, docType: string, storagePath: string, status?: string) =>
      confirmUpload(accessToken, applicationId, docType, storagePath, status),
    verifyDocument: (applicationId: string, documentId: string, status: DocumentVerificationStatus, note?: string) =>
      verifyDocument(accessToken, applicationId, documentId, status, note)
  }
}
