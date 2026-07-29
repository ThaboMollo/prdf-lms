import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Analytics } from '@vercel/analytics/react'
import * as Sentry from '@sentry/react'
import { App } from './App'
import { ErrorBoundary } from './components/shared/ErrorBoundary'
import { ToastProvider } from './components/shared/ToastProvider'
import { GlobalLoader } from './components/shared/GlobalLoader'
import { applyTenantTheme } from './lib/applyTenantTheme'
import { resolveTenant, setActiveTenant, assertNoDomainCollisions } from '../../packages/tenant-config'
import { UnknownTenant } from '../../packages/ui-kit/components/UnknownTenant'
import { env } from './lib/config/env'
import './styles/global.css'

// Safe to skip entirely when unset — Sentry.init isn't called at all rather
// than called with an empty DSN, avoiding noisy SDK warnings in local dev.
if (env.VITE_SENTRY_DSN) {
  Sentry.init({ dsn: env.VITE_SENTRY_DSN, environment: import.meta.env.MODE })
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15000,
      gcTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1
    }
  }
})

const root = ReactDOM.createRoot(document.getElementById('root')!)

/**
 * Resolve the tenant from the hostname at RUNTIME, before anything renders
 * (docs/multi-tenant-spec.md §W7).
 *
 * This is what lets one deployment serve every client: adding a tenant becomes
 * a config entry plus a DNS record, rather than a new Vercel project and a
 * rebuild. Previously the tenant was fixed at build time by importing
 * `tenants/prdf` directly, in 11 places.
 *
 * VITE_TENANT_ID is an explicit local-development override — on localhost the
 * hostname matches no tenant. It is opt-in, never a fallback: an unrecognised
 * host with no override still fails, which is exactly what production needs.
 */
assertNoDomainCollisions()
const tenantConfig = resolveTenant(window.location.hostname, env.VITE_TENANT_ID)

if (!tenantConfig) {
  // A dead end on purpose. Falling back to another tenant's branding, copy and
  // login form on a domain that is not theirs would be actively misleading.
  // Worth reporting: an unrecognised host usually means DNS points here but
  // the domain was never added to a tenant's config — a real misconfiguration
  // that is otherwise invisible, since nobody watching a tenant's dashboard
  // would see it.
  Sentry.setTag('tenant', 'unresolved')
  Sentry.captureMessage(`Unresolved tenant for hostname: ${window.location.hostname}`, 'warning')
  root.render(<UnknownTenant hostname={window.location.hostname} />)
} else {
  setActiveTenant(tenantConfig)
  applyTenantTheme(tenantConfig)

  // Tag every Sentry event with the tenant. One deployment now serves every
  // client, so without this an error report says what broke but not for whom
  // (docs/multi-tenant-spec.md §W8). Set after resolution, before render, so
  // it covers errors thrown during the first paint.
  Sentry.setTag('tenant', tenantConfig.id)

  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <BrowserRouter>
              <App />
              <GlobalLoader />
              <Analytics />
            </BrowserRouter>
          </ToastProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </React.StrictMode>
  )
}
