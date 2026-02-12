import type { ApplicationDocument } from '../../../api'
import { env } from '../../../config/env'
import { createSupabaseDataClient } from '../../../supabase/client'
import type { DocumentsRepository } from '../../repositories/documents.repo'

type LoanDocumentRow = {
  id: string
  application_id: string
  doc_type: string
  storage_path: string
  status: string
  uploaded_by: string
  uploaded_at: string
}

function mapLoanDocumentRow(row: LoanDocumentRow): ApplicationDocument {
  return {
    id: row.id,
    applicationId: row.application_id,
    docType: row.doc_type,
    storagePath: row.storage_path,
    status: row.status,
    uploadedBy: row.uploaded_by,
    uploadedAt: row.uploaded_at
  }
}

function getUserIdFromAccessToken(accessToken: string): string {
  try {
    const [, payload] = accessToken.split('.')
    if (!payload) return ''
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { sub?: string }
    return json.sub ?? ''
  } catch {
    return ''
  }
}

export function createSupabaseDocumentsAdapter(accessToken: string): DocumentsRepository {
  const client = createSupabaseDataClient(accessToken)
  const actorUserId = getUserIdFromAccessToken(accessToken)
  const bucket = env.VITE_SUPABASE_DOCS_BUCKET

  return {
    async getDocuments(applicationId: string): Promise<ApplicationDocument[]> {
      const { data, error } = await client
        .from('loan_documents')
        .select('id, application_id, doc_type, storage_path, status, uploaded_by, uploaded_at')
        .eq('application_id', applicationId)
        .order('uploaded_at', { ascending: false })

      if (error) {
        throw new Error(`Supabase list documents failed: ${error.message}`)
      }

      return (data as LoanDocumentRow[]).map(mapLoanDocumentRow)
    },
    async uploadDocument(applicationId: string, docType: string, file: File, status = 'Uploaded'): Promise<ApplicationDocument> {
      if (!actorUserId) {
        throw new Error('Unable to resolve authenticated user id for document upload.')
      }

      const storagePath = `applications/${applicationId}/${crypto.randomUUID()}-${file.name}`
      const upload = await client.storage.from(bucket).upload(storagePath, file, {
        contentType: file.type || 'application/octet-stream',
        upsert: false
      })
      if (upload.error) {
        throw new Error(`Supabase storage upload failed: ${upload.error.message}`)
      }

      const { data, error } = await client
        .from('loan_documents')
        .insert({
          application_id: applicationId,
          doc_type: docType,
          storage_path: storagePath,
          status,
          uploaded_by: actorUserId
        })
        .select('id, application_id, doc_type, storage_path, status, uploaded_by, uploaded_at')
        .single()

      if (error) {
        throw new Error(`Supabase confirm upload failed: ${error.message}`)
      }

      return mapLoanDocumentRow(data as LoanDocumentRow)
    },
    async presignUpload(applicationId: string, _docType: string, fileName: string): Promise<{
      bucket: string
      storagePath: string
      uploadUrl: string
      expiresInSeconds: number
    }> {
      const storagePath = `applications/${applicationId}/${crypto.randomUUID()}-${fileName}`
      return {
        bucket,
        storagePath,
        uploadUrl: '',
        expiresInSeconds: 0
      }
    },
    async confirmUpload(applicationId: string, docType: string, storagePath: string, status = 'Uploaded'): Promise<ApplicationDocument> {
      if (!actorUserId) {
        throw new Error('Unable to resolve authenticated user id for document confirm.')
      }

      const { data, error } = await client
        .from('loan_documents')
        .insert({
          application_id: applicationId,
          doc_type: docType,
          storage_path: storagePath,
          status,
          uploaded_by: actorUserId
        })
        .select('id, application_id, doc_type, storage_path, status, uploaded_by, uploaded_at')
        .single()

      if (error) {
        throw new Error(`Supabase confirm upload failed: ${error.message}`)
      }

      return mapLoanDocumentRow(data as LoanDocumentRow)
    },
    async verifyDocument(_applicationId: string, documentId: string, status, note?: string): Promise<void> {
      if (!actorUserId) {
        throw new Error('Unable to resolve authenticated user id for document verification.')
      }

      const { error } = await client
        .from('loan_documents')
        .update({
          status,
          verification_note: note ?? null,
          verified_by: actorUserId,
          verified_at: new Date().toISOString()
        })
        .eq('id', documentId)

      if (error) {
        throw new Error(`Supabase verify document failed: ${error.message}`)
      }
    }
  }
}
