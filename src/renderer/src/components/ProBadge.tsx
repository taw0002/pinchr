import { Badge } from '@/components/ui/badge'
import { Crown } from 'lucide-react'
import { useLicense } from '@/hooks/useLicense'
import { useState } from 'react'
import { UpgradeModal } from './UpgradeModal'

interface ProBadgeProps {
  feature?: string
  className?: string
  variant?: 'default' | 'subtle'
}

export function ProBadge({ feature, className = '', variant = 'default' }: ProBadgeProps) {
  const { isProFeature } = useLicense()
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)

  // Don't show badge if feature is available on current plan
  if (!feature || isProFeature(feature)) {
    return null
  }

  const handleClick = () => {
    setShowUpgradeModal(true)
  }

  return (
    <>
      <Badge
        className={`cursor-pointer transition-all hover:scale-105 select-none ${
          variant === 'subtle'
            ? 'bg-amber-500/15 text-amber-600 border-amber-500/30 hover:bg-amber-500/20'
            : 'bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0 hover:from-amber-600 hover:to-orange-600'
        } ${className}`}
        onClick={handleClick}
      >
        <Crown className="h-3 w-3 mr-1" />
        PRO
      </Badge>
      
      <UpgradeModal 
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
      />
    </>
  )
}