import { useEffect, useState } from 'react'
import { useIsFetching, useIsMutating } from '@tanstack/react-query'

// Small delay so instant responses don't flash the overlay.
const SHOW_DELAY_MS = 250

/**
 * Full-screen loading overlay shown whenever any React Query request
 * (fetch or mutation) is in flight. Mount once, inside QueryClientProvider.
 */
export function GlobalLoader() {
  // Foreground only: count initial loads (fetching with no data yet) and
  // mutations — but not silent background refetches/polls of loaded queries.
  const fetching = useIsFetching({ predicate: (query) => query.state.data === undefined })
  const mutating = useIsMutating()
  const active = fetching + mutating > 0
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!active) {
      setVisible(false)
      return
    }
    const timer = window.setTimeout(() => setVisible(true), SHOW_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [active])

  if (!visible) return null

  return (
    <div className="global-loader" role="status" aria-live="polite" aria-label="Loading">
      <div className="global-loader__panel">
        <span className="global-loader__ring" aria-hidden="true" />
        <img className="global-loader__logo" src="/prdf-logo.png" alt="PRDF" />
      </div>
    </div>
  )
}
