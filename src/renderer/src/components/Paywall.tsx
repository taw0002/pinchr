import { useState } from 'react'
import { Key, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import appIcon from '@/assets/icon.png'

interface PaywallProps {
  trialDaysExpired: number
  isVerifying: boolean
  onActivateLicense: (key: string) => Promise<boolean>
  onOpenUpgrade: () => void
}

export function Paywall({
  trialDaysExpired,
  isVerifying,
  onActivateLicense,
  onOpenUpgrade
}: PaywallProps) {
  const [licenseKey, setLicenseKey] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleActivate = async () => {
    const trimmed = licenseKey.trim()
    if (!trimmed) {
      setErrorMessage('Enter your license key to continue.')
      return
    }

    setErrorMessage(null)
    const success = await onActivateLicense(trimmed)
    if (!success) {
      setErrorMessage('That license key is invalid. Please try again.')
    }
  }

  const daysAgoLabel = trialDaysExpired === 1 ? '1 day ago' : `${trialDaysExpired} days ago`

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 py-10">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl shadow-black/30">
        <div className="mb-6 flex items-center gap-3">
          <img src={appIcon} alt="Pinchr logo" className="h-10 w-10 rounded-xl" />
          <div>
            <p className="text-sm text-text-secondary">Pinchr Desktop</p>
            <p className="text-base font-semibold text-text-primary">Your trial has ended</p>
          </div>
        </div>

        <p className="text-sm text-text-secondary">
          Enter your license key to continue.
        </p>
        <p className="mt-1 text-xs text-text-muted">
          Trial expired {daysAgoLabel}.
        </p>

        <div className="mt-5 space-y-3">
          <Input
            type="text"
            placeholder="Enter your license key"
            value={licenseKey}
            onChange={(event) => {
              setLicenseKey(event.target.value)
              if (errorMessage) setErrorMessage(null)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void handleActivate()
              }
            }}
            disabled={isVerifying}
            className="font-mono"
          />

          {errorMessage && (
            <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {errorMessage}
            </p>
          )}

          <Button onClick={() => void handleActivate()} className="w-full gap-2" disabled={isVerifying}>
            {isVerifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Key className="h-4 w-4" />}
            Activate License
          </Button>

          <div className="flex items-center gap-3 py-1">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-text-muted">OR</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <Button variant="secondary" onClick={onOpenUpgrade} className="w-full">
            Get Pinchr
          </Button>
        </div>
      </div>
    </div>
  )
}
