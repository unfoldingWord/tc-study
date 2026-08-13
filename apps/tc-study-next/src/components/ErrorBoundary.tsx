import { Component, type ErrorInfo, type ReactNode } from 'react'

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
        <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
          <div className="w-full max-w-2xl rounded-lg border border-red-200 bg-white p-8 shadow-lg">
            <h1 className="mb-4 text-2xl font-bold text-red-600">
              Something went wrong
            </h1>
            <div className="mb-4">
              <h2 className="mb-2 font-semibold text-gray-900">Error:</h2>
              <pre className="overflow-auto rounded bg-gray-100 p-4 text-sm">
                {this.state.error.toString()}
              </pre>
            </div>
            {this.state.errorInfo && (
              <div className="mb-4">
                <h2 className="mb-2 font-semibold text-gray-900">
                  Component Stack:
                </h2>
                <pre className="overflow-auto rounded bg-gray-100 p-4 text-xs">
                  {this.state.errorInfo.componentStack}
                </pre>
              </div>
            )}
            <div className="mb-4">
              <h2 className="mb-2 font-semibold text-gray-900">Stack Trace:</h2>
              <pre className="overflow-auto rounded bg-gray-100 p-4 text-xs">
                {this.state.error.stack}
              </pre>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            >
              Reload Page
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
