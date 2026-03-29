import { Component, type ErrorInfo, type ReactNode } from 'react'

type ErrorBoundaryProps = {
  children: ReactNode
}

type ErrorBoundaryState = {
  hasError: boolean
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  public static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('UI crash captured by ErrorBoundary', error, errorInfo)
  }

  public render() {
    if (this.state.hasError) {
      return (
        <main className="auth-wrap">
          <div className="auth-card">
            <h1>Something went wrong</h1>
            <p>The page failed to render. Refresh to try again.</p>
            <button type="button" className="btn" onClick={() => window.location.reload()}>
              Try again
            </button>
          </div>
        </main>
      )
    }

    return this.props.children
  }
}
