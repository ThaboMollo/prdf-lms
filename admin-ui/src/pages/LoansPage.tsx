import { PageHeader } from '../components/shared/PageHeader'
import { EmptyState } from '../components/shared/EmptyState'

// Placeholder (ADM-010) — fills the previously-dead /loans nav tab. The loan
// list is built in ADM-061.
export function LoansPage() {
  return (
    <section className="stack">
      <PageHeader title="Loans" subtitle="Active and closed loans across the book." />
      <EmptyState title="Loans list is coming soon" message="The loan table lands in ADM-061." />
    </section>
  )
}
