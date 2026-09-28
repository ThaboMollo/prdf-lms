import { useMemo } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { EmptyState } from '../components/shared/EmptyState'
import { CardSkeleton } from '../components/shared/Skeletons'
import { StatusBadge } from '../components/shared/StatusBadge'
import { ApplicationReview } from '../components/shared/ApplicationReview'
import { useToast } from '../components/shared/ToastProvider'
import type { ApplicationDocument, MeResponse } from '../lib/api'
import { formatDate } from '../lib/format'
import { RATE_PROFILE_LABEL } from '../lib/loanCalc'
import { formatIndicativeRate, indicativeQuote } from '../lib/creditQuote'
import { DOCUMENT_LABELS, expectedFileCount } from '../lib/requirements'
import { createApplicationsUseCases } from '../logic/usecases/applications'
import { createDocumentsUseCases } from '../logic/usecases/documents'
import { buildReviewModelFromApplication, type DocSlot } from '../features/applications/reviewModel'
import { useActiveLoanProduct, useDocumentRequirements } from '../../../packages/client-core/useLoanProduct'
import { usePublicPricingConfig } from '../../../packages/client-core/usePricingConfig'
import { buildLoanName } from '../../../packages/domain/loanName'

type ApplicationReviewPageProps = {
  session: Session
  me: MeResponse
}

/**
 * A submitted application, read-only.
 *
 * "No edits" is enforced by what this page does not render: no Edit links (the
 * shared ApplicationReview only draws them when given an onEditStep), no
 * dropzone, no remove. That is belt-and-braces rather than the control — the
 * API already refuses a client write to a non-Draft application, and RLS
 * refuses a document delete outside Draft, so hiding the affordances is a
 * courtesy to the user, not the security boundary.
 */
export function ApplicationReviewPage({ session }: ApplicationReviewPageProps) {
  const accessToken = session.access_token
  const navigate = useNavigate()
  const toast = useToast()
  const { id } = useParams<{ id: string }>()

  const applicationsUseCases = useMemo(() => createApplicationsUseCases(accessToken), [accessToken])
  const documentsUseCases = useMemo(() => createDocumentsUseCases(accessToken), [accessToken])

  const appQuery = useQuery({
    queryKey: ['application-detail', id],
    queryFn: () => applicationsUseCases.getApplication(id as string),
    enabled: Boolean(id),
  })

  const docsQuery = useQuery({
    queryKey: ['application-documents', id],
    queryFn: () => documentsUseCases.getDocuments(id as string),
    enabled: Boolean(id),
  })

  const details = appQuery.data
  const { data: activeProduct } = useActiveLoanProduct()
  // The application's own product, not today's active one — required documents
  // are per-product, and an application priced under a retired product should
  // be read against the list it was actually assembled under.
  const productId = details?.loanProductId ?? activeProduct?.id
  const { data: docRequirements = [] } = useDocumentRequirements(productId ?? undefined, accessToken)
  const { data: pricing } = usePublicPricingConfig()

  const docSlots: DocSlot[] = docRequirements.map((req) => ({
    type: req.docType,
    label: DOCUMENT_LABELS[req.docType]?.label ?? req.docType,
    hint: DOCUMENT_LABELS[req.docType]?.hint ?? '',
    multiple: req.allowsMultiple,
    expectedCount: expectedFileCount(req.docType),
  }))

  async function handleViewDoc(doc: ApplicationDocument) {
    try {
      const url = await documentsUseCases.createSignedUrl(doc.applicationId, doc.id)
      window.open(url, '_blank', 'noopener')
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not open the document.', 'error')
    }
  }

  if (!id) return <Navigate to="/applications" replace />

  if (appQuery.isLoading) {
    return (
      <section className="client-page">
        <CardSkeleton />
      </section>
    )
  }

  if (appQuery.isError || !details) {
    return (
      <section className="client-page">
        <EmptyState
          title="Could not load this application"
          message="It may have been removed, or your connection dropped. Go back to your applications and try again."
          ctaLabel="Back to Applications"
          ctaHref="/applications"
        />
      </section>
    )
  }

  // A draft has no submitted state to review; send it to the wizard instead of
  // rendering a half-empty read-only page.
  if (details.status === 'Draft') {
    return <Navigate to={`/apply?draft=${details.id}`} replace />
  }

  const model = buildReviewModelFromApplication(details, docsQuery.data ?? [], docSlots)
  const estimate = pricing ? indicativeQuote(pricing, details.requestedAmount, details.termMonths) : null
  const rateLabel = pricing ? formatIndicativeRate(pricing) : RATE_PROFILE_LABEL
  const name = buildLoanName({
    businessName: details.clientDetails?.businessName ?? details.businessName,
    applicantFullName: details.clientDetails?.fullName ?? details.applicantFullName,
    date: details.createdAt,
  })
  const totalFiles = model.documentRows.reduce((sum, row) => sum + row.files.length, 0)

  return (
    <section className="client-page">
      <div className="page-header">
        <div>
          <p className="section-eyebrow">
            <Link to="/applications">Applications</Link> · #{details.id.slice(0, 8)}
          </p>
          <h1>{name}</h1>
          <p>
            Submitted {formatDate(details.submittedAt ?? details.createdAt)} · read-only
          </p>
        </div>
        <div className="app-review__header-actions">
          <StatusBadge status={details.status} />
          <Link className="btn btn-ghost" to="/status">Track status</Link>
        </div>
      </div>

      <div className="app-review__notice">
        <i className="fa-solid fa-lock" aria-hidden="true" />
        <span>
          This is the application as you submitted it. Details can no longer be changed — contact your loan
          officer if something needs correcting.
        </span>
      </div>

      <div className="card app-review__body">
        <ApplicationReview
          model={model}
          estimate={estimate}
          rateLabel={rateLabel}
          onViewDocument={handleViewDoc}
          documentsTitle={`Documents (${totalFiles} file${totalFiles !== 1 ? 's' : ''})`}
          quoteNote="Indicative only, recalculated at today's published rate — not the quote issued at submission, and not a credit approval or offer."
        />
      </div>

      <div className="app-review__footer">
        <button type="button" className="btn btn-ghost" onClick={() => navigate('/applications')}>
          ← Back to Applications
        </button>
        {details.loanId ? (
          <Link className="btn btn-primary" to={`/loans/${details.loanId}`}>View loan</Link>
        ) : null}
      </div>
    </section>
  )
}
