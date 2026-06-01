import { Link, useNavigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'

type PublicNavProps = {
  session: Session | null
}

export function PublicNav({ session }: PublicNavProps) {
  const navigate = useNavigate()

  return (
    <nav className="public-nav" aria-label="Main navigation">
      <div className="public-nav-inner">
        <Link to="/" className="public-nav-brand">
          PRDF
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
