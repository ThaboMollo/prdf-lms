import { useParams } from 'react-router-dom'
import { PageHeader } from '../components/shared/PageHeader'
import { EmptyState } from '../components/shared/EmptyState'

// Placeholder (ADM-010). The merged application + loan workspace is built in
// ADM-030; the id is read here so breadcrumbs already resolve (Dashboard ›
// Case › #id).
export function CasePage() {
  const { id } = useParams<{ id: string }>()

  return (
    <section className="stack">
      <PageHeader title="Case" subtitle={id ? `Case ${id}` : 'Case workspace'} />
      <EmptyState
        title="Case workspace is coming soon"
        message="The merged application + loan workspace lands in ADM-030."
      />
    </section>
  )
}
