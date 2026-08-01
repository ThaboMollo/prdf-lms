import { PageHeader } from '../components/shared/PageHeader'
import { EmptyState } from '../components/shared/EmptyState'

// Placeholder (ADM-010). The filterable case list is built in ADM-020.
export function PipelinePage() {
  return (
    <section className="stack">
      <PageHeader title="Pipeline" subtitle="Search and drill into cases by status." />
      <EmptyState title="Pipeline is coming soon" message="The filterable case list lands in ADM-020." />
    </section>
  )
}
