import { formatRand } from '../../lib/loanCalc'
import type { IndicativeQuote } from '../../lib/creditQuote'
import type { ApplicationReviewModel, ReviewDocRow } from '../../features/applications/reviewModel'
import type { ApplicationDocument } from '../../lib/api'
import { formatTimeInOperation } from '../../../../packages/domain/businessAge'

// Strip the "<uuid>-" prefix storage adds, to show the original filename.
export function docFileName(storagePath: string): string {
  const last = storagePath.split('/').pop() ?? storagePath
  return last.replace(/^[0-9a-fA-F-]{36}-/, '')
}

type SectionStatus = { tone: 'ok' | 'warn' | 'error'; text: string }

function ReviewSection({
  title,
  step,
  onEditStep,
  status,
  children,
}: {
  title: string
  step: number
  onEditStep?: (step: number) => void
  status?: SectionStatus
  children: React.ReactNode
}) {
  return (
    <section className="review-section">
      <header className="review-section__head">
        <h3>{title}</h3>
        <div className="review-section__head-right">
          {status && <span className={`review-badge review-badge--${status.tone}`}>{status.text}</span>}
          {/* Read-only mode is the ABSENCE of this callback, not a boolean
              prop — there is no `readOnly={false}` to get wrong, and a caller
              that cannot edit simply has nothing to pass. */}
          {onEditStep && (
            <button type="button" className="review-section__edit" onClick={() => onEditStep(step)}>
              Edit
            </button>
          )}
        </div>
      </header>
      {children}
    </section>
  )
}

function DocumentRow({
  row,
  onViewDocument,
}: {
  row: ReviewDocRow
  onViewDocument?: (doc: ApplicationDocument) => void
}) {
  const tone = row.missing ? 'missing' : row.short ? 'short' : 'ok'
  const icon = row.missing ? 'fa-circle-xmark' : row.short ? 'fa-triangle-exclamation' : 'fa-circle-check'

  return (
    <li className={`review-doc-item review-doc-item--${tone}`}>
      <i className={`fa-solid ${icon}`} aria-hidden="true" />
      <span className="review-doc-item__label">{row.label}</span>
      <span className="review-doc-item__files">
        {row.missing ? (
          <span className="review-doc-item__missing">Missing</span>
        ) : (
          row.files.map((file) => {
            const name = docFileName(file.storagePath)
            // Viewing is a read, not an edit, so it stays available in
            // read-only mode; the signed URL is minted per click.
            return onViewDocument ? (
              <button
                key={file.id}
                type="button"
                className="review-doc-item__file review-doc-item__file--link"
                title={name}
                onClick={() => onViewDocument(file)}
              >
                {name}
              </button>
            ) : (
              <span key={file.id} className="review-doc-item__file" title={name}>
                {name}
              </span>
            )
          })
        )}
      </span>
      {row.expected && row.expected > 1 ? (
        <span className={`review-doc-item__count${row.short ? ' review-doc-item__count--short' : ''}`}>
          {row.files.length} of {row.expected}
        </span>
      ) : null}
    </li>
  )
}

/**
 * The application summary, shared by the apply wizard's review step and the
 * read-only view of a submitted application.
 *
 * One component rather than two screens that happen to look alike: the wizard
 * review and the submitted review must agree about what an application says,
 * and the codebase has already been bitten by three drifted copies of the same
 * document labels.
 */
export function ApplicationReview({
  model,
  estimate,
  rateLabel,
  onEditStep,
  onViewDocument,
  documentsTitle,
  quoteNote,
}: {
  model: ApplicationReviewModel
  estimate: IndicativeQuote | null
  rateLabel: string
  /** Omit for read-only: no Edit affordance is rendered at all. */
  onEditStep?: (step: number) => void
  onViewDocument?: (doc: ApplicationDocument) => void
  documentsTitle?: string
  /** Caveat under the quote, e.g. that it was recalculated at today's rates. */
  quoteNote?: string
}) {
  const { business, financials, loan } = model

  const docStatus: SectionStatus = model.missingCount
    ? { tone: 'error', text: `${model.missingCount} missing` }
    : model.shortCount
      ? { tone: 'warn', text: `${model.shortCount} may be short` }
      : { tone: 'ok', text: 'Complete' }

  return (
    <>
      <div className="review-grid">
        {business && (
          <ReviewSection title="Business Profile" step={1} onEditStep={onEditStep}>
            <dl className="review-dl">
              <div className="review-row"><dt>Business name</dt><dd>{business.businessName}</dd></div>
              <div className="review-row"><dt>Reg. number</dt><dd>{business.registrationNo}</dd></div>
              <div className="review-row"><dt>Industry</dt><dd>{business.industry}</dd></div>
              <div className="review-row"><dt>Province</dt><dd>{business.province}</dd></div>
              <div className="review-row"><dt>Country</dt><dd>{business.country}</dd></div>
              <div className="review-row"><dt>Location type</dt><dd>{business.spatialType}</dd></div>
            </dl>
          </ReviewSection>
        )}

        {financials && (
          <ReviewSection title="Financial Info" step={2} onEditStep={onEditStep}>
            <dl className="review-dl">
              <div className="review-row">
                <dt>Monthly revenue</dt>
                <dd>{financials.monthlyRevenue == null ? '—' : formatRand(financials.monthlyRevenue)}</dd>
              </div>
              <div className="review-row"><dt>Time in operation</dt><dd>{formatTimeInOperation(financials.yearsInOperation, financials.monthsInOperation)}</dd></div>
              <div className="review-row"><dt>Employees</dt><dd>{financials.numberOfEmployees ?? '—'}</dd></div>
              <div className="review-row"><dt>Bank</dt><dd>{financials.bankName}</dd></div>
            </dl>
          </ReviewSection>
        )}

        <ReviewSection title="Loan Details" step={3} onEditStep={onEditStep}>
          <dl className="review-dl">
            <div className="review-row"><dt>Amount</dt><dd>{formatRand(loan.amount)}</dd></div>
            <div className="review-row"><dt>Term</dt><dd>{loan.term} months</dd></div>
            <div className="review-row"><dt>Category</dt><dd>{loan.category || '—'}</dd></div>
          </dl>
          {loan.purpose ? <p className="review-purpose">{loan.purpose}</p> : null}
        </ReviewSection>

        {/* Full width: ten rows of long labels and long stored filenames never
            fitted a half-width column, which is what forced the ellipsis that
            hid which file had been attached. */}
        <div className="review-section--wide">
          <ReviewSection
            title={documentsTitle ?? `Documents (${model.docsProvided} of ${model.docsTotal})`}
            step={4}
            onEditStep={onEditStep}
            status={docStatus}
          >
            {model.documentRows.length ? (
              <ul className="review-docs">
                {model.documentRows.map((row) => (
                  <DocumentRow key={row.docType} row={row} onViewDocument={onViewDocument} />
                ))}
              </ul>
            ) : (
              <p className="muted-text">No documents attached.</p>
            )}
          </ReviewSection>
        </div>
      </div>

      {/* The headline figure gets its own band rather than sitting in a
          definition list — it is the one number an applicant is agreeing to. */}
      <div className="review-quote">
        <div className="review-quote__headline">
          <span className="review-quote__headline-label">Indicative total repayable</span>
          <span className="review-quote__headline-value">
            {estimate ? formatRand(estimate.totalRepayable) : '—'}
          </span>
        </div>
        <dl className="review-quote__grid">
          <div className="review-quote__cell">
            <dt>Interest{estimate ? ` (${estimate.daysFinanced} days)` : ''}</dt>
            <dd>{estimate ? formatRand(estimate.interest) : '—'}</dd>
          </div>
          <div className="review-quote__cell">
            <dt>Initiation fee (once-off)</dt>
            <dd>{estimate ? formatRand(estimate.initiationFee) : '—'}</dd>
          </div>
          <div className="review-quote__cell">
            <dt>Management fee (once-off)</dt>
            <dd>{estimate ? formatRand(estimate.managementFee) : '—'}</dd>
          </div>
          <div className="review-quote__cell">
            <dt>Lending rate</dt>
            <dd>{rateLabel}</dd>
          </div>
        </dl>
        {quoteNote ? <p className="review-quote__note">{quoteNote}</p> : null}
      </div>
    </>
  )
}
