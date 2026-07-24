import type { TenantConfig } from '../../../packages/tenant-config/schema'

/**
 * Sets the existing brand/status CSS custom properties (defined in
 * styles/global.css) from the active tenant's colour tokens, at startup.
 * Keeps global.css's existing var-based styling working unchanged, while
 * both apps now derive --brand/--brand-accent/etc. from one shared source
 * instead of two hand-copied blocks. Only the colour dimension is wired up
 * this pass — type/density/motion tokens exist in the schema but aren't
 * applied anywhere yet.
 */
export function applyTenantTheme(tenant: TenantConfig) {
  const root = document.documentElement
  const { brand, status } = tenant.color

  root.style.setProperty('--brand', brand[800])
  root.style.setProperty('--brand-accent', brand[600])
  root.style.setProperty('--brand-dark', brand[900])
  root.style.setProperty('--border', brand[800])
  root.style.setProperty('--link', brand[800])

  root.style.setProperty('--danger', status.rejected.fg)
  root.style.setProperty('--danger-soft', status.rejected.bg)
  root.style.setProperty('--ok', status.verified.fg)
  root.style.setProperty('--ok-soft', status.verified.bg)
  root.style.setProperty('--alert', status.pending.fg)
  root.style.setProperty('--alert-soft', status.pending.bg)
}
