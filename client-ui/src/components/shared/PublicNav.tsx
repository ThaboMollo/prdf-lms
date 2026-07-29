import { Link, useNavigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { activeTenant } from '../../../../packages/tenant-config'

type PublicNavProps = {
  session: Session | null
}

export function PublicNav({ session }: PublicNavProps) {
  // Resolved at bootstrap from the hostname (see main.tsx). Called here
  // rather than at module scope: imports are evaluated before main.tsx runs
  // setActiveTenant(), so a module-level call would throw on first import.
  const tenantConfig = activeTenant()
  const navigate = useNavigate()

  return (
    <nav className="public-nav" aria-label="Main navigation">
      <div className="public-nav-inner">
        <Link to="/" className="public-nav-brand" aria-label={`${tenantConfig.displayName} home`}>
          <img src={tenantConfig.logoPath} alt="" className="public-nav-brand__mark" />
          <span>{tenantConfig.displayName}</span>
        </Link>
        <div className="public-nav-actions">
          {session ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => navigate('/home')}
            >
              Go to Dashboard
            </button>
          ) : (
            <>
              <Link to="/login" className="btn btn-ghost">
                Sign In
              </Link>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => navigate('/register')}
              >
                Apply Now
              </button>
            </>
          )}
        </div>
      </div>
    </nav>
  )
}
