import { createDocumentsRepository } from '../../../lib/data/repositories/documents.repo'

export function createDocumentsUseCases(accessToken: string) {
  const repository = createDocumentsRepository(accessToken)

  return {
    getDocuments: (applicationId: string) => repository.getDocuments(applicationId),
    presignUpload: (applicationId: string, docType: string, fileName: string, contentType?: string) =>
      repository.presignUpload(applicationId, docType, fileName, contentType),
    confirmUpload: (applicationId: string, docType: string, storagePath: string, status?: string) =>
      repository.confirmUpload(applicationId, docType, storagePath, status),
    uploadDocumentFlow: (applicationId: string, docType: string, file: File, status = 'Uploaded') =>
      repository.uploadDocument(applicationId, docType, file, status),
    verifyDocument: (applicationId: string, documentId: string, note?: string) =>
      repository.verifyDocument(applicationId, documentId, 'Verified', note),
    rejectDocument: (applicationId: string, documentId: string, note?: string) =>
      repository.verifyDocument(applicationId, documentId, 'Rejected', note),
    deleteDocument: (applicationId: string, documentId: string, storagePath: string) =>
      repository.deleteDocument(applicationId, documentId, storagePath),
    createSignedUrl: (storagePath: string, expiresInSeconds?: number) =>
      repository.createSignedUrl(storagePath, expiresInSeconds)
  }
}
