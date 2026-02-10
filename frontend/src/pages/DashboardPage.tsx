import { useQuery } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { fetchMe } from '../lib/api'

type DashboardPageProps = {
  session: Session | null
}

export function DashboardPage({ session }: DashboardPageProps) {
  const accessToken = session?.access_token ?? ''

  const meQuery = useQuery({
    queryKey: ['me', session?.user.id],
    queryFn: () => fetchMe(accessToken),
    enabled: Boolean(accessToken)
  })

  const role = (session?.user.user_metadata?.role as string | undefined) ?? 'Authenticated User'

  return (
    <section>
      <h1>Dashboard</h1>
      <p>Role-based placeholder: {role}</p>
      <h2>API Profile (/me)</h2>
      {meQuery.isLoading ? <p>Loading profile...</p> : null}
      {meQuery.isError ? <p style={{ color: 'crimson' }}>Unable to load /me from API.</p> : null}
      {meQuery.data ? (
        <pre>{JSON.stringify(meQuery.data, null, 2)}</pre>
      ) : null}
    </section>
  )
}
