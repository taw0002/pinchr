import type { CSSProperties } from 'react'

interface TrialBannerProps {
  daysLeft: number
  onUpgrade: () => void
}

export function TrialBanner({ daysLeft, onUpgrade }: TrialBannerProps) {
  const label = daysLeft === 1 ? '1 day left' : `${daysLeft} days left`

  return (
    <button
      type="button"
      onClick={onUpgrade}
      className="inline-flex items-center rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-medium text-accent transition-colors hover:border-accent/50 hover:bg-accent/15"
      title="Upgrade to keep using Pinchr after the trial"
      style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
    >
      Trial: {label} - Upgrade
    </button>
  )
}
