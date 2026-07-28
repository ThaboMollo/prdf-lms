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
import { prdf as tenantConfig } from '../../packages/tenant-config/tenants/prdf'
import { env } from './lib/config/env'
import './styles/global.css'

document.documentElement.setAttribute('data-theme', 'light')
window.localStorage.setItem('theme', 'light')
applyTenantTheme(tenantConfig)

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

ReactDOM.createRoot(document.getElementById('root')!).render(
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
