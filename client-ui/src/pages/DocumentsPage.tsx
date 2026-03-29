import type { Session } from '@supabase/supabase-js'
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { EmptyState } from '../components/shared/EmptyState'
import { ListSkeleton } from '../components/shared/Skeletons'
import { StatusBadge } from '../components/shared/StatusBadge'
import type { ApplicationSummary, MeResponse } from '../lib/api'
import { formatDateTime } from '../lib/format'
import { createApplicationsUseCases } from '../logic/usecases/applications'
import { createDocumentsUseCases } from '../logic/usecases/documents'
import { requiredDocumentTypes } from '../lib/requirements'

type DocumentsPageProps = {
  session: Session
  me: MeResponse
}

export function DocumentsPage({ session }: DocumentsPageProps) {
  const navigate = useNavigate()
  const accessToken = session.access_token
  const applicationsUseCases = useMemo(() => createApplicationsUseCases(accessToken), [accessToken])
  const documentsUseCases = useMemo(() => createDocumentsUseCases(accessToken), [accessToken])
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null)

  const appsQuery = useQuery({
    queryKey: ['documents-applications', session.user.id],
    queryFn: () => applicationsUseCases.listApplications()
  })

  const apps = appsQuery.data ?? []
  const effectiveAppId = selectedAppId ?? (apps[0]?.id ?? null)

  const docsQuery = useQuery({
    queryKey: ['documents', effectiveAppId],
    queryFn: () => documentsUseCases.getDocuments(effectiveAppId as string),
    enabled: Boolean(effectiveAppId)
  })

  const documents = docsQuery.data ?? []
  const missingDocs = requiredDocumentTypes.filter((requiredDoc) => !documents.some((doc) => doc.docType === requiredDoc))

  return (
    <section className="client-page">
      <div className="card soft-card">
        <h1>Documents</h1>
        <p className="muted-text">Upload and track required documents for your application.</p>
        {appsQuery.isLoading ? <ListSkeleton rows={4} /> : null}

        {!appsQuery.isLoading && !apps.length ? (
          <EmptyState title="No applications yet" message="Create an application before uploading documents." />
        ) : null}

        {apps.length ? (
          <div className="form-grid">
            <label>
              Select application
              <select value={effectiveAppId ?? ''} onChange={(e) => setSelectedAppId(e.target.value)}>
                {apps.map((app) => (
                  <option key={app.id} value={app.id}>
                    {app.id.slice(0, 8)} • {formatDateTime(app.createdAt)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
      </div>

      {effectiveAppId ? (
        <section className="grid-two">
          <div className="card soft-card">
            <h2>Required documents</h2>
            <ul className="list-clean">
              {requiredDocumentTypes.map((docType) => {
                const found = documents.find((doc) => doc.docType === docType)
                return (
                  <li key={docType} className="list-row">
                    <span>{docType}</span>
                    {found ? <StatusBadge status={found.status} /> : <span className="status-pill">Missing</span>}
                  </li>
                )
              })}
            </ul>
            {missingDocs.length ? (
              <p className="muted-text">Missing: {missingDocs.join(', ')}</p>
            ) : (
              <div className="stack-sm">
                <p className="muted-text">All required documents are uploaded.</p>
                <button className="btn" type="button" onClick={() => navigate('/home')}>Go to dashboard</button>
              </div>
            )}
          </div>
          <div className="card soft-card">
            <h2>Uploaded files</h2>
            {docsQuery.isLoading ? <ListSkeleton rows={4} /> : null}
            {!docsQuery.isLoading && !documents.length ? (
              <EmptyState title="No uploads yet" message="Use the Apply page to upload your files." />
            ) : null}
            {documents.length ? (
              <ul className="list-clean">
                {documents.map((doc) => (
                  <li key={doc.id} className="list-row">
                    <div>
                      <p className="list-title">{doc.docType}</p>
                      <small>Uploaded {formatDateTime(doc.uploadedAt)}</small>
                    </div>
                    <StatusBadge status={doc.status} />
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </section>
      ) : null}
    </section>
  )
}
