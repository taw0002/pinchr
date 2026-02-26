import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertCircle, CheckCircle2, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

interface ReportIssueProps {
  isOpen: boolean
  onClose: () => void
}

export function ReportIssue({ isOpen, onClose }: ReportIssueProps) {
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [includeSystemInfo, setIncludeSystemInfo] = useState(true)
  const [includeRecentLogs, setIncludeRecentLogs] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  const handleSubmit = async () => {
    if (!subject.trim() || !description.trim()) {
      setSubmitStatus('error')
      setErrorMessage('Subject and description are required')
      return
    }

    setIsSubmitting(true)
    setSubmitStatus('idle')
    setErrorMessage('')

    try {
      // Gather system info
      let systemInfo = {}
      if (includeSystemInfo) {
        const appVersion = await window.api?.app?.version().then(r => r.ok ? r.data : '0.3.0').catch(() => '0.3.0')
        systemInfo = {
          version: appVersion,
          platform: window.navigator?.platform || 'unknown',
          userAgent: window.navigator?.userAgent || 'unknown',
          os: window.navigator?.platform || 'unknown'
        }
      }

      // Gather recent logs (last 50 lines of console)
      let recentLogs: string[] = []
      if (includeRecentLogs) {
        // In a real implementation, this would capture console logs
        // For now, we'll just send a placeholder
        recentLogs = ['Console logs would be captured here']
      }

      // Submit to API
      const payload = {
        subject: subject.trim(),
        description: description.trim(),
        systemInfo: includeSystemInfo ? systemInfo : undefined,
        recentLogs: includeRecentLogs ? recentLogs : undefined,
        timestamp: new Date().toISOString()
      }

      const response = await fetch('https://pinchr.app/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        throw new Error(`Failed to submit: ${response.statusText}`)
      }

      setSubmitStatus('success')
      setTimeout(() => {
        onClose()
        // Reset form
        setSubject('')
        setDescription('')
        setIncludeSystemInfo(true)
        setIncludeRecentLogs(false)
        setSubmitStatus('idle')
      }, 2000)
    } catch (error) {
      setSubmitStatus('error')
      setErrorMessage(error instanceof Error ? error.message : 'Failed to submit issue')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    if (!isSubmitting) {
      onClose()
      // Reset form after animation
      setTimeout(() => {
        setSubject('')
        setDescription('')
        setIncludeSystemInfo(true)
        setIncludeRecentLogs(false)
        setSubmitStatus('idle')
        setErrorMessage('')
      }, 300)
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
          />

          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: 'spring', duration: 0.3, bounce: 0.3 }}
              className="relative w-full max-w-lg rounded-xl border border-border bg-surface shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-border px-6 py-4">
                <h2 className="text-lg font-semibold text-text-primary">Report Issue</h2>
                <button
                  onClick={handleClose}
                  disabled={isSubmitting}
                  className="rounded-lg p-1 text-text-muted hover:bg-surface-2 hover:text-text-primary transition-colors disabled:opacity-50"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Content */}
              <div className="space-y-4 px-6 py-4">
                {/* Subject */}
                <div className="space-y-2">
                  <Label htmlFor="subject" className="text-sm font-medium text-text-primary">
                    Subject <span className="text-red-400">*</span>
                  </Label>
                  <input
                    id="subject"
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Brief description of the issue"
                    disabled={isSubmitting}
                    className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 disabled:opacity-50"
                  />
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <Label htmlFor="description" className="text-sm font-medium text-text-primary">
                    Description <span className="text-red-400">*</span>
                  </Label>
                  <textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Detailed description of what happened..."
                    disabled={isSubmitting}
                    rows={6}
                    className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 disabled:opacity-50 resize-none"
                  />
                </div>

                {/* Options */}
                <div className="space-y-3">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeSystemInfo}
                      onChange={(e) => setIncludeSystemInfo(e.target.checked)}
                      disabled={isSubmitting}
                      className="h-4 w-4 rounded border-border bg-surface-2 text-accent focus:ring-2 focus:ring-accent/50 disabled:opacity-50"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-text-primary">Include system info</p>
                      <p className="text-xs text-text-muted">Version, platform, OS</p>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeRecentLogs}
                      onChange={(e) => setIncludeRecentLogs(e.target.checked)}
                      disabled={isSubmitting}
                      className="h-4 w-4 rounded border-border bg-surface-2 text-accent focus:ring-2 focus:ring-accent/50 disabled:opacity-50"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-text-primary">Include recent logs</p>
                      <p className="text-xs text-text-muted">Last 50 lines of console</p>
                    </div>
                  </label>
                </div>

                {/* Status Messages */}
                {submitStatus === 'error' && (
                  <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                    <p className="text-sm text-red-400">{errorMessage || 'Failed to submit issue'}</p>
                  </div>
                )}

                {submitStatus === 'success' && (
                  <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3 flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    <p className="text-sm text-green-400">Issue submitted successfully!</p>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
                <Button
                  variant="outline"
                  onClick={handleClose}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={isSubmitting || submitStatus === 'success'}
                  className="gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Submitting...
                    </>
                  ) : submitStatus === 'success' ? (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      Submitted
                    </>
                  ) : (
                    'Submit'
                  )}
                </Button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}
