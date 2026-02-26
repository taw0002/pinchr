import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Mail,
  Calendar,
  Newspaper,
  CheckSquare,
  Plus,
  X,
  Edit3,
  Save,
  Settings
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
interface QuickAction {
  id: string
  emoji: string
  label: string
  prompt: string
}

const defaultActions: QuickAction[] = [
  {
    id: 'email',
    emoji: '📧',
    label: 'Check email',
    prompt: 'Check my email for anything urgent'
  },
  {
    id: 'schedule',
    emoji: '📅',
    label: "Today's schedule",
    prompt: "What's on my calendar today?"
  },
  {
    id: 'news',
    emoji: '📰',
    label: 'News briefing',
    prompt: 'Give me a quick news briefing'
  },
  {
    id: 'tasks',
    emoji: '✅',
    label: 'My tasks',
    prompt: 'What tasks do I have pending?'
  }
]

interface QuickActionsProps {
  onActionClick: (prompt: string) => void
}

export default function QuickActions({ onActionClick }: QuickActionsProps) {
  const [actions, setActions] = useState<QuickAction[]>(defaultActions)
  const [isEditMode, setIsEditMode] = useState(false)
  const [editingAction, setEditingAction] = useState<QuickAction | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  // Load actions from config on mount
  useEffect(() => {
    loadQuickActions()
  }, [])

  const loadQuickActions = async () => {
    try {
      const result = await (window as unknown as { api: { quickActions: { load: () => Promise<{ ok: boolean; data?: QuickAction[] }> } } }).api.quickActions.load()
      if (result.ok && result.data) {
        setActions(result.data)
      }
    } catch (error) {
      console.error('Failed to load quick actions:', error)
      // Fall back to default actions
      setActions(defaultActions)
    }
  }

  const saveQuickActions = async (newActions: QuickAction[]) => {
    try {
      await (window as unknown as { api: { quickActions: { save: (actions: QuickAction[]) => Promise<{ ok: boolean }> } } }).api.quickActions.save(newActions)
      setActions(newActions)
    } catch (error) {
      console.error('Failed to save quick actions:', error)
    }
  }

  const handleActionClick = (action: QuickAction) => {
    if (isEditMode) {
      setEditingAction({ ...action })
      setIsDialogOpen(true)
    } else {
      onActionClick(action.prompt)
    }
  }

  const handleAddNew = () => {
    setEditingAction({
      id: Date.now().toString(),
      emoji: '⚡',
      label: 'New Action',
      prompt: ''
    })
    setIsDialogOpen(true)
  }

  const handleSaveAction = () => {
    if (!editingAction) return

    const newActions = editingAction.id === 'new' || !actions.find(a => a.id === editingAction.id)
      ? [...actions, { ...editingAction, id: editingAction.id === 'new' ? Date.now().toString() : editingAction.id }]
      : actions.map(a => a.id === editingAction.id ? editingAction : a)

    saveQuickActions(newActions)
    setIsDialogOpen(false)
    setEditingAction(null)
  }

  const handleDeleteAction = (actionId: string) => {
    const newActions = actions.filter(a => a.id !== actionId)
    saveQuickActions(newActions)
  }

  const handleResetToDefaults = () => {
    saveQuickActions(defaultActions)
    setIsEditMode(false)
  }

  return (
    <div className="px-6 py-3 border-t border-border bg-surface/50">
      <div className="flex items-center gap-3 max-w-3xl mx-auto">
        <ScrollArea className="flex-1">
          <div className="flex items-center gap-2">
            <AnimatePresence mode="popLayout">
              {actions.map((action, index) => (
                <motion.div
                  key={action.id}
                  initial={{ opacity: 0, scale: 0.8, x: -20 }}
                  animate={{ opacity: 1, scale: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.8, x: -20 }}
                  transition={{ 
                    duration: 0.2, 
                    delay: index * 0.05,
                    type: "spring",
                    stiffness: 300,
                    damping: 25
                  }}
                  layout
                >
                  <Button
                    onClick={() => handleActionClick(action)}
                    variant="ghost"
                    className="h-9 px-4 rounded-full bg-surface-2 hover:bg-accent/15 hover:text-accent border border-border/50 hover:border-accent/30 transition-all duration-200 whitespace-nowrap group relative"
                  >
                    <span className="mr-2">{action.emoji}</span>
                    <span className="text-sm font-medium">{action.label}</span>
                    
                    {isEditMode && (
                      <motion.button
                        initial={{ opacity: 0, scale: 0 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0 }}
                        className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-colors"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteAction(action.id)
                        }}
                      >
                        <X className="h-3 w-3" />
                      </motion.button>
                    )}
                  </Button>
                </motion.div>
              ))}
            </AnimatePresence>

            {isEditMode && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
              >
                <Button
                  onClick={handleAddNew}
                  variant="ghost"
                  className="h-9 px-4 rounded-full bg-surface-2 hover:bg-accent/15 hover:text-accent border border-dashed border-accent/50 hover:border-accent transition-all duration-200"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  <span className="text-sm font-medium">Add</span>
                </Button>
              </motion.div>
            )}
          </div>
        </ScrollArea>

        <div className="flex items-center gap-2">
          {isEditMode ? (
            <>
              <Button
                onClick={() => setIsEditMode(false)}
                variant="ghost"
                size="sm"
                className="h-9 text-accent hover:bg-accent/15"
              >
                <Save className="h-4 w-4 mr-1" />
                Done
              </Button>
              <Button
                onClick={handleResetToDefaults}
                variant="ghost"
                size="sm"
                className="h-9 text-text-muted hover:bg-surface-2"
              >
                Reset
              </Button>
            </>
          ) : (
            <div className="flex items-center gap-1">
              <Button
                onClick={() => {
                  setIsEditMode(true)
                }}
                variant="ghost"
                size="sm"
                className="h-9 text-text-muted hover:bg-surface-2 hover:text-text-primary"
                title="Customize quick actions"
              >
                <Settings className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Edit Action Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingAction?.id === 'new' || !actions.find(a => a.id === editingAction?.id) ? 'Add Quick Action' : 'Edit Quick Action'}
            </DialogTitle>
            <DialogDescription>
              Create a quick action for frequently used prompts.
            </DialogDescription>
          </DialogHeader>
          
          {editingAction && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-text-primary mb-2 block">
                  Emoji
                </label>
                <Input
                  value={editingAction.emoji}
                  onChange={(e) => setEditingAction({ ...editingAction, emoji: e.target.value })}
                  placeholder="⚡"
                  className="w-20 text-center"
                  maxLength={2}
                />
              </div>
              
              <div>
                <label className="text-sm font-medium text-text-primary mb-2 block">
                  Label
                </label>
                <Input
                  value={editingAction.label}
                  onChange={(e) => setEditingAction({ ...editingAction, label: e.target.value })}
                  placeholder="Quick action name"
                />
              </div>
              
              <div>
                <label className="text-sm font-medium text-text-primary mb-2 block">
                  Prompt
                </label>
                <Input
                  value={editingAction.prompt}
                  onChange={(e) => setEditingAction({ ...editingAction, prompt: e.target.value })}
                  placeholder="The prompt to send when clicked"
                />
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSaveAction}
              disabled={!editingAction?.label.trim() || !editingAction?.prompt.trim()}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}