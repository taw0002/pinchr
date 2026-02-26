import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ExternalLink, Shield, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import logoIcon from '@/assets/icon.png'

const TOS_VERSION = '2026-02-13'

interface TosAcceptanceProps {
  onAccept: () => void
}

export function TosAcceptance({ onAccept }: TosAcceptanceProps) {
  const [accepted, setAccepted] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)

  const handleAccept = async () => {
    if (!accepted) return

    setIsProcessing(true)
    try {
      const acceptance = {
        accepted: true,
        acceptedAt: new Date().toISOString(),
        version: TOS_VERSION
      }

      const result = await window.api.files.write('tos-acceptance.json', JSON.stringify(acceptance, null, 2))

      if (result.ok) {
        onAccept()
      } else {
        console.error('Failed to save TOS acceptance:', result.error)
        alert('Failed to save acceptance. Please try again.')
      }
    } catch (error) {
      console.error('Error saving TOS acceptance:', error)
      alert('An error occurred. Please try again.')
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background p-6">
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2 }}
          className="w-full max-w-2xl rounded-2xl border border-border bg-surface p-8 shadow-xl"
        >
          {/* Header */}
          <div className="mb-6 flex flex-col items-center text-center">
            <img src={logoIcon} alt="Pinchr" className="mb-4 h-16 w-16 rounded-2xl" />
            <h1 className="mb-2 text-2xl font-semibold text-text-primary">Welcome to Pinchr</h1>
            <p className="text-sm text-text-muted">
              Before you start, please review and accept our terms
            </p>
          </div>

          {/* Brief summary + links */}
          <div className="mb-6 rounded-lg border border-border bg-surface-2 p-4 text-center">
            <p className="mb-3 text-sm text-text-muted">
              Pinchr runs AI agents locally on your machine. Your data stays private — we don't sell or share it.
            </p>
            <div className="flex justify-center gap-4">
              <a
                href="https://pinchr.app/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
              >
                <FileText className="h-3.5 w-3.5" />
                Terms of Service
                <ExternalLink className="h-3 w-3" />
              </a>
              <a
                href="https://pinchr.app/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
              >
                <Shield className="h-3.5 w-3.5" />
                Privacy Policy
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>

          {/* Acceptance Checkbox */}
          <div className="mb-6 flex items-start gap-3 rounded-lg border border-accent/30 bg-surface-2 p-4">
            <Checkbox
              id="tos-accept"
              checked={accepted}
              onCheckedChange={(checked) => setAccepted(checked === true)}
              className="mt-0.5 border-accent/60"
            />
            <label htmlFor="tos-accept" className="cursor-pointer text-sm text-text-primary">
              I have read and agree to the{' '}
              <a
                href="https://pinchr.app/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline"
              >
                Terms of Service
              </a>{' '}
              and{' '}
              <a
                href="https://pinchr.app/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline"
              >
                Privacy Policy
              </a>
            </label>
          </div>

          {/* Accept Button */}
          <Button
            onClick={handleAccept}
            disabled={!accepted || isProcessing}
            className="w-full"
            size="lg"
          >
            {isProcessing ? 'Saving...' : 'Accept & Continue'}
          </Button>

          {/* Fine Print */}
          <p className="mt-4 text-center text-xs text-text-muted">
            You can cancel your account anytime. By continuing, you acknowledge that Pinchr is provided as-is.
          </p>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

export async function checkTosAcceptance(): Promise<{ accepted: boolean; needsUpdate: boolean }> {
  try {
    const result = await window.api.files.read('tos-acceptance.json')

    if (!result.ok || !result.data) {
      return { accepted: false, needsUpdate: false }
    }

    const acceptance = JSON.parse(result.data)

    // Check if user has accepted
    if (!acceptance.accepted) {
      return { accepted: false, needsUpdate: false }
    }

    // Check if version matches (for future TOS updates)
    if (acceptance.version !== TOS_VERSION) {
      return { accepted: true, needsUpdate: true }
    }

    return { accepted: true, needsUpdate: false }
  } catch {
    // File doesn't exist or is malformed
    return { accepted: false, needsUpdate: false }
  }
}
