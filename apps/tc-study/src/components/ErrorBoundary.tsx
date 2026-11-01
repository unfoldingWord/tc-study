import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from './ui/Button'
import { Card } from './ui/Card'

interface Props {
  children: ReactNode
  fallback?: (error: Error, errorInfo: ErrorInfo) => ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
    this.setState({ error, errorInfo })
  }

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.state.errorInfo!)
      }

      return (
        <div className="flex min-h-screen items-center justify-center bg-canvas p-4">
          <Card className="w-full max-w-2xl border-danger/30 shadow-lg">
            <h1 className="mb-4 text-2xl font-bold text-danger">Something went wrong</h1>
            <div className="mb-4">
              <h2 className="mb-2 font-semibold text-fg">Error:</h2>
              <pre className="overflow-auto rounded bg-muted p-4 text-sm text-fg">
                {this.state.error.toString()}
              </pre>
            </div>
            {this.state.errorInfo && (
              <div className="mb-4">
                <h2 className="mb-2 font-semibold text-fg">Component Stack:</h2>
                <pre className="overflow-auto rounded bg-muted p-4 text-xs text-fg">
                  {this.state.errorInfo.componentStack}
                </pre>
              </div>
            )}
            <div className="mb-4">
              <h2 className="mb-2 font-semibold text-fg">Stack Trace:</h2>
              <pre className="overflow-auto rounded bg-muted p-4 text-xs text-fg">
                {this.state.error.stack}
              </pre>
            </div>
            <Button onClick={() => window.location.reload()} className="rounded-lg">
              Reload Page
            </Button>
          </Card>
        </div>
      )
    }

    return this.props.children
  }
}
