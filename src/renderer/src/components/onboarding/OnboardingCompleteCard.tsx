import { motion } from 'framer-motion'
import { ArrowRight, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface OnboardingCompleteCardProps {
  onComplete: () => void
}

export function OnboardingCompleteCard({ onComplete }: OnboardingCompleteCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className="glass-card relative w-full max-w-xl rounded-2xl border border-border/50 p-8 text-center"
    >
      <div className="relative mx-auto mb-6 inline-block">
        <motion.div
          className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-accent-hover shadow-glow"
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15 }}
        >
          <Sparkles className="h-8 w-8 text-white" />
        </motion.div>
      </div>

      <h3 className="mb-2 text-2xl font-bold text-text-primary">You're all set!</h3>
      <p className="mb-6 text-sm text-text-secondary">
        Click below whenever you're ready, or keep chatting here. I'm excited to help you get things done!
      </p>

      <Button onClick={onComplete} size="lg" className="h-12 px-10 text-base shadow-glow-sm">
        Start Using Pinchr
        <ArrowRight className="ml-2 h-5 w-5" />
      </Button>
    </motion.div>
  )
}
