import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, RefreshCw, ChevronDown, ChevronUp, Bug } from 'lucide-react'
import { Button } from './ui/button'
import { telemetry } from '@/services/telemetry'

interface ErrorBoundaryProps {
  children: React.ReactNode
  fallback?: React.ReactNode
  onReset?: () => void
  onReportIssue?: () => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: React.ErrorInfo | null
  showDetails: boolean
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null, showDetails: false }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught error:', error, errorInfo.componentStack)
    this.setState({ errorInfo })

    // Track error in telemetry
    telemetry.trackError(error.message, {
      component: 'ErrorBoundary',
      stack: error.stack?.substring(0, 500) // Limit stack trace size
    })
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, showDetails: false })
    this.props.onReset?.()
  }

  toggleDetails = () => {
    this.setState((prev) => ({ showDetails: !prev.showDetails }))
  }

  handleReportIssue = () => {
    this.props.onReportIssue?.()
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    if (this.props.fallback) {
      return this.props.fallback
    }

    const { error, errorInfo, showDetails } = this.state
    const hasReportIssue = typeof this.props.onReportIssue === 'function'

    return (
      <div className="flex h-full items-center justify-center bg-background p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: 'spring', duration: 0.4, bounce: 0.3 }}
          className="w-full max-w-lg rounded-xl border border-red-500/20 bg-gradient-to-br from-red-500/5 to-red-500/10 backdrop-blur-xl shadow-2xl"
        >
          {/* Glass morphism overlay */}
          <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-surface/80 to-surface/40 backdrop-blur-xl" />

          {/* Content */}
          <div className="relative p-6 text-center">
            {/* Icon */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
              className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/20 ring-4 ring-red-500/10"
            >
              <AlertTriangle className="h-6 w-6 text-red-400" />
            </motion.div>

            {/* Title */}
            <h2 className="text-lg font-semibold text-text-primary mb-2">
              Something went wrong
            </h2>

            {/* Error message */}
            <p className="text-sm text-text-secondary mb-6">
              {error?.message || 'An unexpected error occurred'}
            </p>

            {/* Action buttons */}
            <div className="flex items-center justify-center gap-3 mb-4">
              <Button
                onClick={this.handleReset}
                variant="outline"
                className="gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Try Again
              </Button>

              {hasReportIssue && (
                <Button
                  onClick={this.handleReportIssue}
                  variant="outline"
                  className="gap-2"
                >
                  <Bug className="h-4 w-4" />
                  Report Issue
                </Button>
              )}
            </div>

            {/* Collapsible error details */}
            <div className="mt-6">
              <button
                onClick={this.toggleDetails}
                className="flex items-center justify-center gap-2 w-full text-sm text-text-muted hover:text-text-secondary transition-colors"
              >
                {showDetails ? (
                  <>
                    <ChevronUp className="h-4 w-4" />
                    Hide details
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-4 w-4" />
                    Show details
                  </>
                )}
              </button>

              <AnimatePresence>
                {showDetails && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-4 rounded-lg border border-border bg-surface-2 p-4 text-left">
                      <div className="space-y-3">
                        {/* Error stack */}
                        {error?.stack && (
                          <div>
                            <p className="text-xs font-medium text-text-secondary mb-2">
                              Stack Trace:
                            </p>
                            <pre className="text-[10px] text-text-muted font-mono overflow-x-auto whitespace-pre-wrap break-words">
                              {error.stack}
                            </pre>
                          </div>
                        )}

                        {/* Component stack */}
                        {errorInfo?.componentStack && (
                          <div>
                            <p className="text-xs font-medium text-text-secondary mb-2">
                              Component Stack:
                            </p>
                            <pre className="text-[10px] text-text-muted font-mono overflow-x-auto whitespace-pre-wrap break-words">
                              {errorInfo.componentStack}
                            </pre>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      </div>
    )
  }
}
