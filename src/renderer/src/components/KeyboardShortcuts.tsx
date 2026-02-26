import React, { useState } from 'react'
import { Search, Keyboard } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog'
import { Input } from './ui/input'
import { ScrollArea } from './ui/scroll-area'
import { cn } from '@/lib/utils'

interface KeyboardShortcut {
  keys: string[]
  description: string
  category: 'Navigation' | 'Pages' | 'Actions' | 'General'
}

interface KeyboardShortcutsProps {
  isOpen: boolean
  onClose: () => void
}

const shortcuts: KeyboardShortcut[] = [
  // General
  { keys: ['⌘', 'K'], description: 'Open command palette', category: 'General' },
  { keys: ['⌘', '?'], description: 'Show keyboard shortcuts', category: 'General' },
  { keys: ['⌘', ','], description: 'Open settings', category: 'General' },
  { keys: ['Esc'], description: 'Close dialog/modal', category: 'General' },

  // Navigation
  { keys: ['⌘', '1'], description: 'Go to Dashboard', category: 'Navigation' },
  { keys: ['⌘', '2'], description: 'Go to Chat', category: 'Navigation' },
  { keys: ['⌘', '3'], description: 'Go to Brain', category: 'Navigation' },
  { keys: ['⌘', '4'], description: 'Go to Automations', category: 'Navigation' },
  { keys: ['⌘', '5'], description: 'Go to Settings', category: 'Navigation' },
  { keys: ['⌘', '6'], description: 'Go to Memory Explorer', category: 'Navigation' },
  { keys: ['⌘', '8'], description: 'Go to Document Style', category: 'Navigation' },

  // Actions
  { keys: ['⌘', 'N'], description: 'New chat', category: 'Actions' },
  { keys: ['⌘', 'S'], description: 'Save file (in editors)', category: 'Actions' },
]

export function KeyboardShortcuts({ isOpen, onClose }: KeyboardShortcutsProps) {
  const [query, setQuery] = useState('')

  // Filter shortcuts based on query
  const filteredShortcuts = shortcuts.filter(
    (shortcut) =>
      query === '' ||
      shortcut.description.toLowerCase().includes(query.toLowerCase()) ||
      shortcut.keys.some((key) => key.toLowerCase().includes(query.toLowerCase()))
  )

  // Group by category
  const groupedShortcuts = filteredShortcuts.reduce((acc, shortcut) => {
    if (!acc[shortcut.category]) acc[shortcut.category] = []
    acc[shortcut.category].push(shortcut)
    return acc
  }, {} as Record<string, KeyboardShortcut[]>)

  const categoryOrder: Array<KeyboardShortcut['category']> = [
    'General',
    'Navigation',
    'Actions',
    'Pages',
  ]

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-text-primary">
            <Keyboard className="h-5 w-5 text-accent" />
            Keyboard Shortcuts
          </DialogTitle>
          <DialogDescription>
            Navigate faster with keyboard shortcuts
          </DialogDescription>
        </DialogHeader>

        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search shortcuts..."
            className="pl-9"
            autoFocus
          />
        </div>

        {/* Shortcuts List */}
        <ScrollArea className="max-h-[400px] pr-4">
          {filteredShortcuts.length === 0 ? (
            <div className="py-8 text-center text-text-muted text-sm">
              No shortcuts found
            </div>
          ) : (
            <div className="space-y-6">
              {categoryOrder.map((category) => {
                const categoryShortcuts = groupedShortcuts[category]
                if (!categoryShortcuts || categoryShortcuts.length === 0) return null

                return (
                  <div key={category}>
                    <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">
                      {category}
                    </h3>
                    <div className="space-y-2">
                      {categoryShortcuts.map((shortcut, index) => (
                        <div
                          key={`${category}-${index}`}
                          className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-surface-2 transition-colors"
                        >
                          <span className="text-sm text-text-secondary">
                            {shortcut.description}
                          </span>
                          <div className="flex items-center gap-1">
                            {shortcut.keys.map((key, keyIndex) => (
                              <React.Fragment key={keyIndex}>
                                <kbd className="inline-flex items-center justify-center min-w-[28px] h-7 px-2 rounded-md border border-border bg-surface-2 text-xs font-medium text-text-primary shadow-sm">
                                  {key}
                                </kbd>
                                {keyIndex < shortcut.keys.length - 1 && (
                                  <span className="text-text-muted text-xs">+</span>
                                )}
                              </React.Fragment>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        <div className="pt-4 border-t border-border">
          <p className="text-xs text-text-muted text-center">
            Press{' '}
            <kbd className="inline-flex items-center justify-center min-w-[24px] h-5 px-1.5 rounded border border-border bg-surface-2 text-[10px] font-medium text-text-primary">
              ⌘
            </kbd>
            {' '}+{' '}
            <kbd className="inline-flex items-center justify-center min-w-[24px] h-5 px-1.5 rounded border border-border bg-surface-2 text-[10px] font-medium text-text-primary">
              ?
            </kbd>
            {' '}to toggle this panel
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
