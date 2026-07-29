import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
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

document.documentElement.setAttribute('data-theme', 'light')
window.localStorage.setItem('theme', 'light')

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
 * (docs/multi-tenant-spec.md §W7). See client-ui/src/main.tsx for the full
 * reasoning — the two apps bootstrap identically.
 */
assertNoDomainCollisions()
const tenantConfig = resolveTenant(window.location.hostname, env.VITE_TENANT_ID)

if (!tenantConfig) {
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
            </BrowserRouter>
          </ToastProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </React.StrictMode>
  )
}
