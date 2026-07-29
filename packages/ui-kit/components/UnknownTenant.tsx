/**
 * Shown when the hostname does not belong to any configured tenant
 * (docs/multi-tenant-spec.md §W7).
 *
 * Deliberately a dead end rather than a redirect to some default tenant.
 * Serving one client's branding, copy and login form on a domain that is not
 * theirs would be worse than an error page — it would be actively misleading
 * to whoever typed the address.
 *
 * Styling stays in each app's global.css, like every other ui-kit component;
 * only the two inline rules below exist so this renders legibly even if the
 * stylesheet failed to load, which is plausible on a misconfigured domain.
 */
export function UnknownTenant({ hostname }: { hostname: string }) {
  return (
    <main className="auth-wrap" style={{ padding: '2rem' }}>
      <section className="auth-card" style={{ maxWidth: 520 }}>
        <h1>This address isn’t configured</h1>
        <p>
          We don’t have a workspace set up for <strong>{hostname}</strong>.
        </p>
        <p className="muted-text">
          If you reached this page from a link or bookmark, check the address. If you administer this
          site, the domain needs to be added to the tenant configuration and pointed at this
          deployment.
        </p>
      </section>
    </main>
  );
}
