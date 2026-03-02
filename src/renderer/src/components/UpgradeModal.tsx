import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Crown,
  Check,
  ExternalLink,
  Key,
  Loader2,
  AlertCircle,
  CheckCircle2
} from 'lucide-react'
import { useLicense } from '@/hooks/useLicense'

interface UpgradeModalProps {
  isOpen: boolean
  onClose: () => void
}

const BASIC_FEATURES = [
  { name: 'Multi-Session Chat', description: 'Create and manage multiple conversations' },
  { name: 'Image Upload', description: 'Attach and analyze images in chat' },
  { name: 'Voice Input', description: 'Record and transcribe voice messages' },
  { name: 'Omnichannel Timeline', description: 'View all channels in one unified feed' },
  { name: 'Tool-Use Display', description: 'See AI actions with clean tool indicators' }
]

const PRO_FEATURES = [
  { name: 'Agent Builder', description: 'Create and manage custom AI agents visually' },
  { name: 'Workflow Builder', description: 'Visual automation with drag-and-drop workflows' },
  { name: 'Everything in Basic', description: 'All core desktop app features included' }
]

export function UpgradeModal({ isOpen, onClose }: UpgradeModalProps) {
  const [showLicenseInput, setShowLicenseInput] = useState(false)
  const [licenseKey, setLicenseKey] = useState('')
  const [validationMessage, setValidationMessage] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)

  const { activate, isActivating, activateError } = useLicense()

  const handleGetPro = () => {
    window.api.shell.openExternal('https://pinchr.app/pricing')
  }

  const handleShowLicenseInput = () => {
    setShowLicenseInput(true)
    setValidationMessage(null)
  }

  const handleActivateLicense = async () => {
    if (!licenseKey.trim()) {
      setValidationMessage({
        type: 'error',
        message: 'Please enter a license key'
      })
      return
    }

    try {
      await activate(licenseKey.trim())
      setValidationMessage({
        type: 'success',
        message: 'License activated successfully! 🎉'
      })
      
      // Close modal after a short delay
      setTimeout(() => {
        onClose()
        setShowLicenseInput(false)
        setLicenseKey('')
        setValidationMessage(null)
      }, 1500)
    } catch (error) {
      setValidationMessage({
        type: 'error',
        message: String(error)
      })
    }
  }

  const handleClose = () => {
    onClose()
    // Reset state after animation
    setTimeout(() => {
      setShowLicenseInput(false)
      setLicenseKey('')
      setValidationMessage(null)
    }, 300)
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg mx-4">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Crown className="h-5 w-5 text-amber-500" />
            Upgrade to Pinchr Pro
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <AnimatePresence mode="wait">
            {!showLicenseInput ? (
              <motion.div
                key="upgrade-content"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                {/* Pricing Tiers */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-border bg-surface-2 p-4 text-center">
                    <Badge variant="secondary" className="mb-2">Basic</Badge>
                    <div className="inline-flex items-baseline gap-1">
                      <span className="text-2xl font-bold text-text-primary">$20</span>
                      <span className="text-text-muted text-xs">/year</span>
                    </div>
                    <p className="text-xs text-text-muted mt-1">Core desktop app</p>
                  </div>
                  <div className="rounded-lg border-2 border-amber-500/50 bg-amber-500/5 p-4 text-center">
                    <Badge className="mb-2 bg-amber-500 text-white">Pro</Badge>
                    <div className="inline-flex items-baseline gap-1">
                      <span className="text-2xl font-bold text-text-primary">$200</span>
                      <span className="text-text-muted text-xs">/year</span>
                    </div>
                    <p className="text-xs text-text-muted mt-1">Agents + Workflows</p>
                  </div>
                </div>

                {/* Basic Features */}
                <div className="space-y-2">
                  <h3 className="font-semibold text-text-primary text-sm">Basic includes:</h3>
                  {BASIC_FEATURES.map((feature, index) => (
                    <motion.div
                      key={feature.name}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="flex items-center gap-3 p-2 rounded-lg bg-surface-2"
                    >
                      <div className="flex-shrink-0 w-5 h-5 rounded-full bg-accent/15 flex items-center justify-center">
                        <Check className="h-3 w-3 text-accent" />
                      </div>
                      <div>
                        <p className="font-medium text-text-primary text-sm">{feature.name}</p>
                        <p className="text-xs text-text-muted">{feature.description}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>

                {/* Pro Features */}
                <div className="space-y-2">
                  <h3 className="font-semibold text-text-primary text-sm">Pro adds:</h3>
                  {PRO_FEATURES.map((feature, index) => (
                    <motion.div
                      key={feature.name}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: (BASIC_FEATURES.length + index) * 0.05 }}
                      className="flex items-center gap-3 p-2 rounded-lg bg-amber-500/5 border border-amber-500/20"
                    >
                      <div className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-500/15 flex items-center justify-center">
                        <Crown className="h-3 w-3 text-amber-500" />
                      </div>
                      <div>
                        <p className="font-medium text-text-primary text-sm">{feature.name}</p>
                        <p className="text-xs text-text-muted">{feature.description}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col gap-2 pt-2">
                  <Button
                    onClick={handleGetPro}
                    className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white border-0"
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Get Started
                  </Button>
                  
                  <Button
                    variant="secondary"
                    onClick={handleShowLicenseInput}
                    className="w-full"
                  >
                    <Key className="h-4 w-4 mr-2" />
                    Enter License Key
                  </Button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="license-input"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                <div className="text-center">
                  <h3 className="font-semibold text-text-primary mb-2">
                    Enter Your License Key
                  </h3>
                  <p className="text-sm text-text-secondary">
                    Enter your Pro license key to unlock all features
                  </p>
                </div>

                <div className="space-y-3">
                  <Input
                    type="text"
                    placeholder="PNCHR-XXXX-XXXX-XXXX-XXXX"
                    value={licenseKey}
                    onChange={(e) => {
                      setLicenseKey(e.target.value.toUpperCase())
                      setValidationMessage(null)
                    }}
                    className="font-mono text-center"
                    disabled={isActivating}
                  />

                  {validationMessage && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
                        validationMessage.type === 'success'
                          ? 'bg-green-500/15 text-green-600 border border-green-500/30'
                          : 'bg-red-500/15 text-red-600 border border-red-500/30'
                      }`}
                    >
                      {validationMessage.type === 'success' ? (
                        <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                      ) : (
                        <AlertCircle className="h-4 w-4 flex-shrink-0" />
                      )}
                      <span>{validationMessage.message}</span>
                    </motion.div>
                  )}

                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => setShowLicenseInput(false)}
                      className="flex-1"
                      disabled={isActivating}
                    >
                      Back
                    </Button>
                    <Button
                      onClick={handleActivateLicense}
                      disabled={isActivating || !licenseKey.trim()}
                      className="flex-1"
                    >
                      {isActivating ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Key className="h-4 w-4 mr-2" />
                      )}
                      Activate
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  )
}