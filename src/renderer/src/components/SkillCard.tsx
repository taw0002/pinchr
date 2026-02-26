import { useState } from 'react'
import { Download, Loader2, MessageSquare, RefreshCw, Trash2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { Skill } from '@/hooks/useSkillMarketplace'
import { useInstallSkill, useUninstallSkill, useUpdateSkill } from '@/hooks/useSkillMarketplace'

interface SkillCardProps {
  skill: Skill
  onSelect: (skill: Skill) => void
  onTrySkill?: (skill: Skill) => void
}

export function SkillCard({ skill, onSelect, onTrySkill }: SkillCardProps) {
  const installSkill = useInstallSkill()
  const uninstallSkill = useUninstallSkill()
  const updateSkill = useUpdateSkill()
  const [error, setError] = useState<string | null>(null)

  const isLoading =
    installSkill.isPending || uninstallSkill.isPending || updateSkill.isPending

  const handleInstall = async (event: React.MouseEvent) => {
    event.stopPropagation()
    setError(null)
    try {
      await installSkill.mutateAsync(skill.slug)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Installation failed')
    }
  }

  const handleUninstall = async (event: React.MouseEvent) => {
    event.stopPropagation()
    setError(null)
    try {
      await uninstallSkill.mutateAsync(skill.slug)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Uninstallation failed')
    }
  }

  const handleUpdate = async (event: React.MouseEvent) => {
    event.stopPropagation()
    setError(null)
    try {
      await updateSkill.mutateAsync(skill.slug)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed')
    }
  }

  const handleTrySkill = (event: React.MouseEvent) => {
    event.stopPropagation()
    onTrySkill?.(skill)
  }

  return (
    <Card
      className="border-border/70 bg-surface-2/70 hover:bg-surface-2 transition-colors cursor-pointer"
      onClick={() => onSelect(skill)}
    >
      <CardContent className="p-4 space-y-3">
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {skill.icon && <span className="text-lg">{skill.icon}</span>}
                <h3 className="font-semibold text-text-primary truncate">{skill.name}</h3>
              </div>
              <p className="text-xs text-text-muted mt-0.5">
                by {skill.author} • v{skill.version}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Badge variant={skill.installed ? 'success' : 'secondary'}>
                {skill.installed ? 'Installed' : 'Available'}
              </Badge>
              {skill.updateAvailable && <Badge variant="warning">Update available</Badge>}
            </div>
          </div>

          <p className="text-sm text-text-secondary line-clamp-2">{skill.description}</p>

          {skill.category && (
            <Badge variant="outline" className="text-[10px]">
              {skill.category}
            </Badge>
          )}
        </div>

        {error && (
          <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded px-2 py-1">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button
            size="sm"
            variant="outline"
            onClick={handleTrySkill}
            className="gap-1.5"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Try it
          </Button>

          {!skill.installed && (
            <Button
              size="sm"
              onClick={handleInstall}
              disabled={isLoading}
              className="flex-1 gap-1.5"
            >
              {installSkill.isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Installing...
                </>
              ) : (
                <>
                  <Download className="h-3.5 w-3.5" />
                  Install
                </>
              )}
            </Button>
          )}

          {skill.installed && !skill.updateAvailable && (
            <Button
              size="sm"
              variant="secondary"
              onClick={handleUninstall}
              disabled={isLoading}
              className="flex-1 gap-1.5 text-red-300 hover:text-red-200"
            >
              {uninstallSkill.isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Removing...
                </>
              ) : (
                <>
                  <Trash2 className="h-3.5 w-3.5" />
                  Uninstall
                </>
              )}
            </Button>
          )}

          {skill.updateAvailable && (
            <>
              <Button
                size="sm"
                onClick={handleUpdate}
                disabled={isLoading}
                className="flex-1 gap-1.5"
              >
                {updateSkill.isPending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Updating...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-3.5 w-3.5" />
                    Update
                  </>
                )}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={handleUninstall}
                disabled={isLoading}
                className="gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
