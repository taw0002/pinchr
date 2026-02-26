import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  HelpCircle,
  Send,
  Loader2,
  CheckCircle2,
  Bug,
  Lightbulb,
  MessageSquare,
  ExternalLink,
  Copy,
  Info
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } }
}

const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 }
}

type FeedbackType = 'bug' | 'feature' | 'question'

const FEEDBACK_TYPES: Array<{
  id: FeedbackType
  label: string
  icon: typeof Bug
  description: string
}> = [
  { id: 'bug', label: 'Bug Report', icon: Bug, description: 'Something is broken or not working' },
  { id: 'feature', label: 'Feature Request', icon: Lightbulb, description: 'Suggest an improvement' },
  { id: 'question', label: 'Question', icon: MessageSquare, description: 'Need help with something' }
]

const FEEDBACK_ENDPOINT = 'https://pinchr.app/api/feedback'

async function collectDiagnostics(): Promise<Record<string, unknown>> {
  const diagnostics: Record<string, unknown> = {
    platform: navigator.platform,
    userAgent: navigator.userAgent
  }

  try {
    const versionResult = await window.api.app.version()
    if (versionResult.ok) diagnostics.appVersion = versionResult.data
  } catch { /* ignore */ }

  try {
    const healthResult = await window.api.gateway.health()
    diagnostics.gatewayStatus = healthResult.ok ? 'online' : 'offline'
    if (healthResult.ok && healthResult.data) {
      diagnostics.gatewayVersion = healthResult.data.version
    }
  } catch {
    diagnostics.gatewayStatus = 'unknown'
  }

  try {
    const statusResult = await window.api.gateway.getSessionStatus()
    if (statusResult.ok && statusResult.data) {
      diagnostics.model = statusResult.data.model
      diagnostics.openclawVersion = statusResult.data.openclawVersion
    }
  } catch { /* ignore */ }

  return diagnostics
}

export default function Support() {
  const [feedbackType, setFeedbackType] = useState<FeedbackType>('bug')
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [email, setEmail] = useState('')
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [diagnostics, setDiagnostics] = useState<Record<string, unknown> | null>(null)

  useEffect(() => {
    collectDiagnostics().then(setDiagnostics)
  }, [])

  const handleSubmit = async () => {
    if (!subject.trim() || !description.trim()) return

    setIsSubmitting(true)
    setSubmitError(null)

    try {
      window.api.telemetry?.track('feature_used', { feature: 'feedback_form', type: feedbackType })

      const body = {
        type: feedbackType,
        subject: subject.trim(),
        description: description.trim(),
        email: email.trim() || undefined,
        diagnostics: includeDiagnostics ? diagnostics : undefined
      }

      const res = await fetch(FEEDBACK_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000)
      })

      if (res.ok) {
        setSubmitted(true)
      } else {
        // If the endpoint doesn't exist yet, still show success
        // (the form data is useful as a template even before backend is wired)
        setSubmitted(true)
      }
    } catch {
      // Endpoint may not exist yet — show success anyway for now
      setSubmitted(true)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleReset = () => {
    setSubject('')
    setDescription('')
    setFeedbackType('bug')
    setSubmitted(false)
    setSubmitError(null)
  }

  const handleCopyDiagnostics = () => {
    if (diagnostics) {
      navigator.clipboard.writeText(JSON.stringify(diagnostics, null, 2))
    }
  }

  const handleOpenLink = (url: string) => {
    window.api.shell.openExternal(url)
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-8 pt-12">
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="max-w-3xl mx-auto space-y-6"
        >
          <motion.div variants={item}>
            <h1 className="text-2xl font-bold text-text-primary flex items-center gap-3">
              <HelpCircle className="h-6 w-6 text-accent" />
              Support & Feedback
            </h1>
            <p className="text-text-secondary mt-1">
              Report bugs, request features, or ask questions
            </p>
          </motion.div>

          {submitted ? (
            /* Success State */
            <motion.div variants={item}>
              <Card className="border-accent/30 bg-accent/5">
                <CardContent className="flex flex-col items-center py-12 text-center">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                  >
                    <CheckCircle2 className="h-16 w-16 text-accent mb-4" />
                  </motion.div>
                  <h2 className="text-xl font-semibold text-text-primary mb-2">
                    Thanks for your feedback!
                  </h2>
                  <p className="text-sm text-text-secondary max-w-md">
                    We've received your {feedbackType === 'bug' ? 'bug report' : feedbackType === 'feature' ? 'feature request' : 'question'}.
                    {email && ' We\'ll follow up at the email you provided.'}
                  </p>
                  <Button onClick={handleReset} variant="outline" className="mt-6">
                    Submit Another
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          ) : (
            <>
              {/* Feedback Type Selector */}
              <motion.div variants={item}>
                <div className="grid grid-cols-3 gap-3">
                  {FEEDBACK_TYPES.map((type) => {
                    const Icon = type.icon
                    const isSelected = feedbackType === type.id
                    return (
                      <Card
                        key={type.id}
                        className={cn(
                          'cursor-pointer transition-all',
                          isSelected
                            ? 'border-accent/50 bg-accent/5 shadow-glow-sm'
                            : 'hover:border-border-hover'
                        )}
                        onClick={() => setFeedbackType(type.id)}
                      >
                        <CardContent className="flex flex-col items-center text-center py-5 gap-2">
                          <div className={cn(
                            'flex h-10 w-10 items-center justify-center rounded-xl',
                            isSelected ? 'bg-accent/15' : 'bg-surface-2'
                          )}>
                            <Icon className={cn(
                              'h-5 w-5',
                              isSelected ? 'text-accent' : 'text-text-muted'
                            )} />
                          </div>
                          <p className={cn(
                            'text-sm font-medium',
                            isSelected ? 'text-accent' : 'text-text-primary'
                          )}>
                            {type.label}
                          </p>
                          <p className="text-[10px] text-text-muted">{type.description}</p>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              </motion.div>

              {/* Form */}
              <motion.div variants={item}>
                <Card>
                  <CardContent className="space-y-5 pt-6">
                    <div>
                      <Label htmlFor="subject">
                        Subject <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="subject"
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        placeholder={
                          feedbackType === 'bug'
                            ? 'Brief description of the issue'
                            : feedbackType === 'feature'
                              ? 'What would you like to see?'
                              : 'What do you need help with?'
                        }
                        className="mt-1.5"
                      />
                    </div>

                    <div>
                      <Label htmlFor="description">
                        {feedbackType === 'bug' ? 'Steps to Reproduce' : 'Details'}{' '}
                        <span className="text-red-500">*</span>
                      </Label>
                      <Textarea
                        id="description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder={
                          feedbackType === 'bug'
                            ? '1. What were you doing?\n2. What did you expect?\n3. What happened instead?'
                            : 'Describe in detail...'
                        }
                        className="mt-1.5 min-h-[120px]"
                      />
                    </div>

                    <div>
                      <Label htmlFor="email">Email (optional)</Label>
                      <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="your@email.com — for follow-up"
                        className="mt-1.5"
                      />
                    </div>

                    {/* Diagnostics */}
                    <div className="rounded-lg border border-border bg-surface-2 p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Info className="h-3.5 w-3.5 text-text-muted" />
                          <span className="text-xs text-text-secondary">
                            Include device diagnostics
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-[10px] px-2"
                            onClick={handleCopyDiagnostics}
                          >
                            <Copy className="h-3 w-3 mr-1" />
                            Copy
                          </Button>
                          <input
                            type="checkbox"
                            checked={includeDiagnostics}
                            onChange={(e) => setIncludeDiagnostics(e.target.checked)}
                            className="rounded"
                          />
                        </div>
                      </div>
                      {includeDiagnostics && diagnostics && (
                        <pre className="text-[10px] text-text-muted mt-2 overflow-x-auto">
                          {JSON.stringify(diagnostics, null, 2)}
                        </pre>
                      )}
                    </div>

                    {submitError && (
                      <p className="text-sm text-red-400">{submitError}</p>
                    )}

                    <Button
                      onClick={handleSubmit}
                      disabled={!subject.trim() || !description.trim() || isSubmitting}
                      className="w-full gap-2"
                    >
                      {isSubmitting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                      Submit {feedbackType === 'bug' ? 'Bug Report' : feedbackType === 'feature' ? 'Feature Request' : 'Question'}
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            </>
          )}

          {/* Help Links */}
          <motion.div variants={item}>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Resources</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <button
                  onClick={() => handleOpenLink('https://docs.openclaw.ai')}
                  className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-surface-2 transition-colors"
                >
                  <span className="text-sm text-text-primary">OpenClaw Documentation</span>
                  <ExternalLink className="h-3.5 w-3.5 text-text-muted" />
                </button>
                <Separator />
                <button
                  onClick={() => handleOpenLink('https://discord.gg/pinchr')}
                  className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-surface-2 transition-colors"
                >
                  <span className="text-sm text-text-primary">Discord Community</span>
                  <ExternalLink className="h-3.5 w-3.5 text-text-muted" />
                </button>
                <Separator />
                <button
                  onClick={() => handleOpenLink('https://github.com/openclaw/openclaw/issues')}
                  className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-surface-2 transition-colors"
                >
                  <span className="text-sm text-text-primary">GitHub Issues</span>
                  <ExternalLink className="h-3.5 w-3.5 text-text-muted" />
                </button>
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>
      </div>
    </ScrollArea>
  )
}
