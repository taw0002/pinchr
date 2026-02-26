import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Package, Search, Loader2, AlertCircle, FolderOpen, Plus } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SkillCard } from '@/components/SkillCard'
import { useAvailableSkills, useWorkspaceSkills, type Skill } from '@/hooks/useSkillMarketplace'
import { useGatewayHealth } from '@/hooks/useGateway'
import type { Page } from '@/types/navigation'
import { CHAT_PREFILL_EVENT, CHAT_PREFILL_STORAGE_KEY } from '@/components/chat/chatUtils'

interface SkillMarketplaceProps {
  onNavigate?: (page: Page) => void
}

export default function SkillMarketplace({ onNavigate }: SkillMarketplaceProps) {
  const { data: health } = useGatewayHealth()
  const { data: workspaceSkills, isLoading: workspaceLoading, error: workspaceError } = useWorkspaceSkills()
  const { data: skills, isLoading, error } = useAvailableSkills({ enabled: Boolean(health) })
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<'workspace' | 'marketplace'>('workspace')
  const [skillBrief, setSkillBrief] = useState('')
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null)

  const isOnline = Boolean(health)

  const filteredWorkspaceSkills = useMemo(() => {
    if (!workspaceSkills) return []
    if (!searchQuery.trim()) return workspaceSkills

    const query = searchQuery.toLowerCase()
    return workspaceSkills.filter(
      (skill) =>
        skill.name.toLowerCase().includes(query) ||
        skill.description.toLowerCase().includes(query) ||
        skill.slug.toLowerCase().includes(query) ||
        skill.path.toLowerCase().includes(query) ||
        skill.emoji.toLowerCase().includes(query) ||
        skill.status.toLowerCase().includes(query)
    )
  }, [workspaceSkills, searchQuery])

  const filteredMarketplaceSkills = useMemo(() => {
    if (!skills) return []
    if (!searchQuery.trim()) return skills

    const query = searchQuery.toLowerCase()
    return skills.filter(
      (skill) =>
        skill.name.toLowerCase().includes(query) ||
        skill.description.toLowerCase().includes(query) ||
        skill.author.toLowerCase().includes(query) ||
        skill.slug.toLowerCase().includes(query) ||
        skill.category?.toLowerCase().includes(query)
    )
  }, [skills, searchQuery])

  const { installedSkills, availableSkills, updatesAvailable } = useMemo(() => {
    const installed: Skill[] = []
    const available: Skill[] = []
    let updates = 0

    filteredMarketplaceSkills.forEach((skill) => {
      if (skill.installed) {
        installed.push(skill)
        if (skill.updateAvailable) updates++
      } else {
        available.push(skill)
      }
    })

    return { installedSkills: installed, availableSkills: available, updatesAvailable: updates }
  }, [filteredMarketplaceSkills])

  const marketplaceCountLabel = useMemo(() => {
    if (!isOnline) return '0'
    if (isLoading) return '...'

    const count = skills?.length ?? 0
    return count >= 50 ? '50+' : String(count)
  }, [isLoading, isOnline, skills])

  const navigateToChatWithPrefill = (prompt: string) => {
    try {
      window.sessionStorage.setItem(CHAT_PREFILL_STORAGE_KEY, prompt)
    } catch {
      // Ignore storage failures and still dispatch event.
    }

    window.dispatchEvent(
      new CustomEvent(CHAT_PREFILL_EVENT, {
        detail: { message: prompt }
      })
    )

    if (onNavigate) {
      onNavigate('chat')
      return
    }

    window.location.hash = '#/chat'
  }

  const handleDescribeSkill = () => {
    const trimmed = skillBrief.trim()
    if (!trimmed) return

    const prompt = `Help me create a new OpenClaw skill for this workspace.

Skill request:
${trimmed}

Please:
1. Propose a skill slug and folder path under skills/<slug>/SKILL.md.
2. Draft the SKILL.md content with clear trigger instructions.
3. Create/update files directly in my workspace.
4. Tell me what you changed and how to test it quickly.`

    navigateToChatWithPrefill(prompt)
  }

  const handleTrySkill = (skill: Skill) => {
    const prompt = skill.installed
      ? `Use the "${skill.name}" skill (${skill.slug}) to help me with this request:\n\n`
      : `Install the "${skill.name}" skill (${skill.slug}) from ClawHub, then help me with this request:\n\n`

    navigateToChatWithPrefill(prompt)
  }

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="mx-auto max-w-7xl space-y-6 px-6 py-6">
        {/* Page Header */}
        <Card className="border-border/70 bg-surface/80 backdrop-blur">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5 text-accent" />
                  Skills
                </CardTitle>
                <CardDescription>
                  View local workspace skills and browse ClawHub marketplace skills
                </CardDescription>
              </div>
              <Button className="gap-2" onClick={() => onNavigate?.('chat')}>
                <Plus className="h-4 w-4" />
                Create in Chat
              </Button>
            </div>
          </CardHeader>
        </Card>

        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as 'workspace' | 'marketplace')}
          className="space-y-4"
        >
          <TabsList className="w-full justify-start">
            <TabsTrigger value="workspace" className="gap-2">
              Installed
              <Badge variant="secondary">{workspaceSkills?.length ?? 0}</Badge>
            </TabsTrigger>
            <TabsTrigger value="marketplace" className="gap-2">
              Marketplace
              <Badge variant="secondary">{marketplaceCountLabel}</Badge>
            </TabsTrigger>
          </TabsList>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <Input
              type="text"
              placeholder={
                activeTab === 'workspace'
                  ? 'Search installed skills by name, description, slug, or path...'
                  : 'Search marketplace skills by name, description, author, or category...'
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          <TabsContent value="workspace" className="space-y-6">
            <Card className="border-border/70 bg-surface/80 backdrop-blur">
              <CardHeader>
                <CardTitle>Describe a New Skill</CardTitle>
                <CardDescription>
                  Describe what you want, then let the agent draft and build the skill for you.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  value={skillBrief}
                  onChange={(event) => setSkillBrief(event.target.value)}
                  placeholder="Example: Create a skill that reviews new Linear tickets every morning, labels urgency, and posts a summary with action items."
                  className="min-h-[110px]"
                />
                <div className="flex items-center gap-2">
                  <Button
                    onClick={handleDescribeSkill}
                    disabled={!skillBrief.trim()}
                    className="gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    Ask Agent to Build Skill
                  </Button>
                  <Button variant="secondary" onClick={() => onNavigate?.('chat')}>
                    Open Chat
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/70 bg-surface/80 backdrop-blur">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <FolderOpen className="h-5 w-5 text-accent" />
                      Workspace Skills ({filteredWorkspaceSkills.length})
                    </CardTitle>
                    <CardDescription>Skills found in your local `skills/*/SKILL.md` folders</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {workspaceLoading && (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="h-6 w-6 animate-spin text-accent" />
                  </div>
                )}

                {workspaceError && (
                  <Card className="border-red-500/30 bg-red-500/10">
                    <CardContent className="p-4">
                      <p className="text-sm text-red-300">
                        Failed to load workspace skills. Check file permissions and workspace path.
                      </p>
                    </CardContent>
                  </Card>
                )}

                {!workspaceLoading && !workspaceError && (workspaceSkills?.length ?? 0) === 0 && (
                  <Card className="border-border/70 bg-surface/70">
                    <CardContent className="flex flex-col items-center justify-center py-8 text-center">
                      <FolderOpen className="mb-3 h-10 w-10 text-text-muted" />
                      <h3 className="text-base font-semibold text-text-primary">No skills installed yet</h3>
                      <p className="mt-1 max-w-md text-sm text-text-secondary">
                        Create your first skill in Chat or describe one above.
                      </p>
                    </CardContent>
                  </Card>
                )}

                {!workspaceLoading &&
                  !workspaceError &&
                  (workspaceSkills?.length ?? 0) > 0 &&
                  filteredWorkspaceSkills.length === 0 && (
                    <Card className="border-border/70 bg-surface/70">
                      <CardContent className="flex flex-col items-center justify-center py-8 text-center">
                        <FolderOpen className="mb-3 h-10 w-10 text-text-muted" />
                        <h3 className="text-base font-semibold text-text-primary">No installed skills match your search</h3>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setSearchQuery('')}
                          className="mt-4"
                        >
                          Clear Search
                        </Button>
                      </CardContent>
                    </Card>
                  )}

                {!workspaceLoading && !workspaceError && filteredWorkspaceSkills.length > 0 && (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {filteredWorkspaceSkills.map((skill) => (
                      <Card key={skill.path} className="border-border/70 bg-surface/70 p-4">
                        <CardContent className="space-y-3 p-0">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="flex items-center gap-2 font-semibold text-text-primary">
                                <span>{skill.emoji}</span>
                                <span className="truncate">{skill.name}</span>
                              </p>
                              <p className="mt-1 text-xs text-text-muted">{skill.slug}</p>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Badge variant="success">Installed</Badge>
                              <Badge variant={skill.status === 'active' ? 'default' : 'secondary'}>
                                {skill.status}
                              </Badge>
                            </div>
                          </div>
                          <p className="line-clamp-2 text-sm text-text-secondary">
                            {skill.description || 'No description'}
                          </p>
                          <p className="truncate rounded bg-surface-2 px-2 py-1 font-mono text-[10px] text-text-muted">
                            {skill.path}
                          </p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="marketplace" className="space-y-6">
            <Card className="border-border/70 bg-surface/80 backdrop-blur">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <CardTitle className="flex items-center gap-2">
                      <Package className="h-5 w-5 text-accent" />
                      ClawHub Marketplace
                    </CardTitle>
                    <CardDescription>Browse and install community skills from ClawHub</CardDescription>
                  </div>
                  {updatesAvailable > 0 && (
                    <Badge variant="warning" className="shrink-0">
                      {updatesAvailable} {updatesAvailable === 1 ? 'update' : 'updates'} available
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {!isOnline && (
                  <Card className="border-amber-500/30 bg-amber-500/5">
                    <CardContent className="p-4">
                      <p className="text-sm text-amber-300 flex items-center gap-2">
                        <AlertCircle className="h-4 w-4" />
                        Marketplace unavailable — check your connection
                      </p>
                    </CardContent>
                  </Card>
                )}

                {isOnline && error && (
                  <Card className="border-red-500/30 bg-red-500/10">
                    <CardContent className="p-4">
                      <p className="text-sm text-red-300">
                        {error instanceof Error
                          ? error.message
                          : 'Failed to load skills from ClawHub. Please try again later.'}
                      </p>
                    </CardContent>
                  </Card>
                )}

                {isOnline && isLoading && (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-accent" />
                  </div>
                )}

                {isOnline && !isLoading && !error && (
                  <div className="space-y-6">
                    {installedSkills.length > 0 && (
                      <div className="space-y-3">
                        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
                          Installed ({installedSkills.length})
                        </h2>
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                          {installedSkills.map((skill) => (
                            <motion.div
                              key={skill.slug}
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.2 }}
                            >
                              <SkillCard skill={skill} onSelect={setSelectedSkill} onTrySkill={handleTrySkill} />
                            </motion.div>
                          ))}
                        </div>
                      </div>
                    )}

                    {availableSkills.length > 0 && (
                      <div className="space-y-3">
                        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
                          Available ({availableSkills.length})
                        </h2>
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                          {availableSkills.map((skill) => (
                            <motion.div
                              key={skill.slug}
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.2 }}
                            >
                              <SkillCard skill={skill} onSelect={setSelectedSkill} onTrySkill={handleTrySkill} />
                            </motion.div>
                          ))}
                        </div>
                      </div>
                    )}

                    {filteredMarketplaceSkills.length === 0 && (
                      <Card className="border-border/70 bg-surface/70">
                        <CardContent className="flex flex-col items-center justify-center py-12">
                          <Package className="h-12 w-12 text-text-muted mb-3" />
                          <h3 className="text-lg font-semibold text-text-primary mb-1">
                            {searchQuery ? 'No skills found' : 'No marketplace skills available'}
                          </h3>
                          <p className="text-sm text-text-secondary text-center max-w-md">
                            {searchQuery
                              ? 'Try adjusting your search query or browse all available skills.'
                              : 'ClawHub returned no skills for this query.'}
                          </p>
                          {searchQuery && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setSearchQuery('')}
                              className="mt-4"
                            >
                              Clear Search
                            </Button>
                          )}
                        </CardContent>
                      </Card>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

      </div>

      {/* Skill Detail Dialog */}
      <Dialog open={!!selectedSkill} onOpenChange={() => setSelectedSkill(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedSkill?.icon && <span className="text-xl">{selectedSkill.icon}</span>}
              {selectedSkill?.name}
            </DialogTitle>
            <DialogDescription>
              by {selectedSkill?.author} • v{selectedSkill?.version}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-text-primary">Description</h3>
              <p className="text-sm text-text-secondary">{selectedSkill?.description}</p>
            </div>

            {selectedSkill?.category && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-text-primary">Category</h3>
                <Badge variant="outline">{selectedSkill.category}</Badge>
              </div>
            )}

            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-text-primary">Installation</h3>
              <p className="text-sm text-text-secondary">
                Slug: <code className="bg-surface-2 px-1.5 py-0.5 rounded text-xs font-mono">{selectedSkill?.slug}</code>
              </p>
            </div>

            {selectedSkill?.installed && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
                <p className="text-xs text-emerald-300 flex items-center gap-2">
                  <Badge variant="success" className="shrink-0">
                    Installed
                  </Badge>
                  This skill is currently installed and ready to use.
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
