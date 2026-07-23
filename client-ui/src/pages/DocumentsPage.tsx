import type { Session } from '@supabase/supabase-js'
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { EmptyState } from '../components/shared/EmptyState'
import { FileDropzone } from '../components/shared/FileDropzone'
import { ListSkeleton } from '../components/shared/Skeletons'
import { StatusBadge } from '../components/shared/StatusBadge'
import { useToast } from '../components/shared/ToastProvider'
import type { MeResponse } from '../lib/api'
import { formatDateTime } from '../lib/format'
import { allDocuments, getDocumentLabel, requiredDocuments } from '../lib/requirements'
import { createApplicationsUseCases } from '../logic/usecases/applications'
import { createDocumentsUseCases } from '../logic/usecases/documents'

type DocumentsPageProps = {
  session: Session
  me: MeResponse
}

export function DocumentsPage({ session }: DocumentsPageProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const accessToken = session.access_token
  const applicationsUseCases = useMemo(() => createApplicationsUseCases(accessToken), [accessToken])
  const documentsUseCases = useMemo(() => createDocumentsUseCases(accessToken), [accessToken])
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null)
  const [selectedDocType, setSelectedDocType] = useState<string>(requiredDocuments[0]?.type ?? 'IDDocument')
  const [uploadFiles, setUploadFiles] = useState<File[]>([])

  const appsQuery = useQuery({
    queryKey: ['documents-applications', session.user.id],
    queryFn: () => applicationsUseCases.listApplications()
  })

  const apps = appsQuery.isError ? [] : appsQuery.data ?? []
  const submittedApps = apps.filter((app) => app.status !== 'Draft')
  const effectiveAppId = selectedAppId ?? (submittedApps[0]?.id ?? apps[0]?.id ?? null)

  const docsQuery = useQuery({
    queryKey: ['documents', effectiveAppId],
    queryFn: () => documentsUseCases.getDocuments(effectiveAppId as string),
    enabled: Boolean(effectiveAppId)
  })

  const uploadMutation = useMutation({
    mutationFn: async () => {
      const file = uploadFiles[0]
      if (!effectiveAppId || !file) {
        throw new Error('Choose an application and document file before uploading.')
      }
      return documentsUseCases.uploadDocumentFlow(effectiveAppId, selectedDocType, file, 'Uploaded')
    },
    onSuccess: async () => {
      setUploadFiles([])
      toast.push(`${getDocumentLabel(selectedDocType)} uploaded.`, 'success')
      await queryClient.invalidateQueries({ queryKey: ['documents', effectiveAppId] })
    },
    onError: (error) => {
      toast.push(error instanceof Error ? error.message : 'Document upload failed.', 'error')
    }
  })

  const documents = effectiveAppId ? (docsQuery.data ?? []) : []
  const selectedDocument = allDocuments.find((doc) => doc.type === selectedDocType) ?? requiredDocuments[0]
  const missingDocs = requiredDocuments.filter((requiredDoc) => !documents.some((doc) => doc.docType === requiredDoc.type))
  const canUpload = Boolean(effectiveAppId)

  return (
    <section className="client-page documents-page">
      <div className="documents-header card soft-card">
        <div>
          <h1>Documents</h1>
          <p className="muted-text">Upload and track the documents required for your funding application.</p>
        </div>
        <button className="btn btn-secondary" type="button" onClick={() => navigate('/status')}>
          View status
        </button>
      </div>

      {appsQuery.isLoading ? <ListSkeleton rows={4} /> : null}

      {appsQuery.isError ? (
        <EmptyState
          title="Could not load applications"
          message="Your applications could not be loaded. You can still review the checklist, then retry when your connection is stable."
          ctaLabel="Retry"
          onCtaClick={() => appsQuery.refetch()}
        />
      ) : null}

      {!appsQuery.isError && !appsQuery.isLoading && !apps.length ? (
        <EmptyState title="No applications yet" message="Use this checklist to prepare your documents, then start an application to upload them." ctaLabel="Apply for Funding" ctaHref="/apply" />
      ) : null}

      {apps.length ? (
        <div className="card soft-card application-selector-card">
          <label>
            Select application
            <select value={effectiveAppId ?? ''} onChange={(e) => setSelectedAppId(e.target.value)}>
              {apps.map((app) => (
                <option key={app.id} value={app.id}>
                  {app.purpose || `Application ${app.id.slice(0, 8)}`} • {formatDateTime(app.createdAt)}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      <section className="documents-grid">
        <div className="card soft-card required-documents-card">
          <div className="section-heading-row">
            <div>
              <h2>Required Documents</h2>
              <p className="muted-text">{missingDocs.length ? `${missingDocs.length} still required` : 'All required documents are uploaded'}</p>
            </div>
            <span className="status-badge status-alert">{missingDocs.length} Missing</span>
          </div>

          <ul className="list-clean document-checklist">
            {requiredDocuments.map((requiredDoc) => {
              const found = documents.find((doc) => doc.docType === requiredDoc.type)
              const isSelected = selectedDocType === requiredDoc.type

              return (
                <li key={requiredDoc.type} className={isSelected ? 'document-checklist-item document-checklist-item-active' : 'document-checklist-item'}>
                  <div className="document-checklist-main">
                    <i className={found ? 'fa-solid fa-circle-check' : 'fa-regular fa-circle'} aria-hidden="true" />
                    <div>
                      <p className="list-title">{requiredDoc.label}</p>
                      <small>{requiredDoc.description}</small>
                    </div>
                  </div>
                  <div className="document-checklist-actions">
                    {found ? <StatusBadge status={found.status} /> : <span className="status-badge status-alert">Missing</span>}
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() => {
                        setSelectedDocType(requiredDoc.type)
                        setUploadFiles([])
                      }}
                    >
                      {found ? 'Replace' : 'Upload'}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>

        </div>

        <div className="card soft-card document-upload-card">
          <div className="section-heading-row">
            <div>
              <h2>Uploaded Files</h2>
              <p className="muted-text">Selected: {selectedDocument?.label ?? selectedDocType}</p>
            </div>
          </div>

          {canUpload ? (
            <>
              <FileDropzone
                label={selectedDocument?.label ?? 'Document'}
                accept=".pdf,.doc,.docx"
                files={uploadFiles}
                onFilesChange={setUploadFiles}
                hint="Drop the selected document here, then upload it to your application."
              />

              <button
                className={`btn btn-primary${uploadMutation.isPending ? ' btn-loading' : ''}`}
                type="button"
                disabled={!uploadFiles.length || uploadMutation.isPending}
                onClick={() => uploadMutation.mutate()}
              >
                {uploadMutation.isPending ? '' : 'Upload Document'}
              </button>
            </>
          ) : (
            <EmptyState title="Upload unavailable" message="Start an application before uploading files to this checklist." ctaLabel="Start application" ctaHref="/apply" />
          )}

          {canUpload ? (
            <div className="uploaded-files-list">
              {docsQuery.isLoading ? <ListSkeleton rows={4} /> : null}
              {docsQuery.isError ? (
                <EmptyState
                  title="Could not load uploaded files"
                  message="Uploaded files could not be loaded. Retry from this page when your connection is stable."
                  ctaLabel="Retry"
                  onCtaClick={() => docsQuery.refetch()}
                />
              ) : null}
              {!docsQuery.isLoading && !docsQuery.isError && !documents.length ? (
                <EmptyState title="No uploads yet" message="Upload your first required document from this panel." />
              ) : null}
              {documents.length ? (
                <ul className="list-clean">
                  {documents.map((doc) => (
                    <li key={doc.id} className="list-row">
                      <div>
                        <p className="list-title">{getDocumentLabel(doc.docType)}</p>
                        <small>Uploaded {formatDateTime(doc.uploadedAt)}</small>
                      </div>
                      <StatusBadge status={doc.status} />
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>
    </section>
  )
}
