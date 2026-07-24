import { Link, useNavigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { prdf as tenantConfig } from '../../../../packages/tenant-config/tenants/prdf'

type PublicNavProps = {
  session: Session | null
}

export function PublicNav({ session }: PublicNavProps) {
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
