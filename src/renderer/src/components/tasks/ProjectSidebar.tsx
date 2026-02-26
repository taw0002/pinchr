import { useMemo, useState } from 'react'
import { FolderPlus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { CreateProjectInput, Project, SmartTask } from '@/hooks/useTasks'

interface ProjectSidebarProps {
  projects: Project[]
  tasks: SmartTask[]
  projectFilter: string | 'all'
  onProjectFilterChange: (projectId: string | 'all') => void
  onAddProject: (input: CreateProjectInput) => void
}

export function ProjectSidebar({
  projects,
  tasks,
  projectFilter,
  onProjectFilterChange,
  onAddProject
}: ProjectSidebarProps) {
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('📁')
  const [color, setColor] = useState('#64748b')
  const [description, setDescription] = useState('')

  const projectCounts = useMemo(() => {
    const counts = new Map<string, number>()
    projects.forEach((project) => counts.set(project.id, 0))
    tasks.forEach((task) => {
      if (!task.projectId) return
      counts.set(task.projectId, (counts.get(task.projectId) ?? 0) + 1)
    })
    return counts
  }, [projects, tasks])

  const resetForm = () => {
    setName('')
    setEmoji('📁')
    setColor('#64748b')
    setDescription('')
    setCreating(false)
  }

  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed) return

    onAddProject({
      name: trimmed,
      emoji: emoji.trim() || '📁',
      color,
      description
    })

    resetForm()
  }

  return (
    <aside className="w-60 border-r border-border bg-surface px-3 py-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-primary">Projects</h2>
        <Button type="button" variant="ghost" size="sm" onClick={() => setCreating((value) => !value)}>
          <FolderPlus className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-1">
        <button
          type="button"
          onClick={() => onProjectFilterChange('all')}
          className={cn(
            'flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-sm transition-colors',
            projectFilter === 'all' ? 'bg-surface-2 text-text-primary' : 'text-text-secondary hover:bg-surface-2'
          )}
        >
          <span>All Tasks</span>
          <span className="text-xs text-text-muted">{tasks.length}</span>
        </button>

        {projects.map((project) => (
          <button
            key={project.id}
            type="button"
            onClick={() => onProjectFilterChange(project.id)}
            className={cn(
              'flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-sm transition-colors',
              projectFilter === project.id ? 'bg-surface-2 text-text-primary' : 'text-text-secondary hover:bg-surface-2'
            )}
          >
            <span className="inline-flex items-center gap-2 truncate">
              <span>{project.emoji}</span>
              <span className="truncate">{project.name}</span>
            </span>
            <span className="text-xs text-text-muted">{projectCounts.get(project.id) ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="mt-4 border-t border-border pt-4">
        <Button type="button" variant="outline" className="w-full" onClick={() => setCreating((value) => !value)}>
          <Plus className="mr-1 h-4 w-4" />
          New Project
        </Button>

        {creating && (
          <div className="mt-3 space-y-2 rounded-lg border border-border bg-surface-2 p-3">
            <div className="grid grid-cols-[56px_1fr] gap-2">
              <Input
                value={emoji}
                onChange={(event) => setEmoji(event.target.value)}
                maxLength={3}
                aria-label="Project emoji"
              />
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Project name"
                aria-label="Project name"
              />
            </div>
            <Input type="color" value={color} onChange={(event) => setColor(event.target.value)} aria-label="Project color" />
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Description (optional)"
              className="min-h-[72px]"
            />
            <div className="flex gap-2">
              <Button type="button" className="flex-1" onClick={submit} disabled={!name.trim()}>
                Create
              </Button>
              <Button type="button" variant="ghost" className="flex-1" onClick={resetForm}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}
