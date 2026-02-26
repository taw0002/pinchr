import { useEffect, useCallback } from 'react'
import type { Page } from '@/types/navigation'

interface KeyboardShortcutHandlers {
  onCommandPalette: () => void
  onNavigate: (page: Page) => void
  onNewChat: () => void
  onSettings: () => void
  onShowKeyboardShortcuts?: () => void
}

export function useKeyboardShortcuts({
  onCommandPalette,
  onNavigate,
  onNewChat,
  onSettings,
  onShowKeyboardShortcuts
}: KeyboardShortcutHandlers) {
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Check for Cmd/Ctrl modifier
    const isMod = event.metaKey || event.ctrlKey

    if (isMod) {
      switch (event.key) {
        case 'k':
          event.preventDefault()
          onCommandPalette()
          break
        
        case '1':
          event.preventDefault()
          onNavigate('dashboard')
          break
        
        case '2':
          event.preventDefault()
          onNavigate('chat')
          break
        
        case '3':
          event.preventDefault()
          onNavigate('brain')
          break
        
        case '4':
          event.preventDefault()
          onNavigate('tasks')
          break
        
        case '5':
          event.preventDefault()
          onNavigate('settings')
          break

        case '6':
          event.preventDefault()
          onNavigate('memory-explorer')
          break

        case '7':
          event.preventDefault()
          onNavigate('automations')
          break

        case '8':
          event.preventDefault()
          onNavigate('sessions')
          break
        
        case 'n':
          event.preventDefault()
          onNewChat()
          break
        
        case ',':
          event.preventDefault()
          onSettings()
          break
        
        case '?':
          if (event.shiftKey) {
            event.preventDefault()
            onShowKeyboardShortcuts?.()
          }
          break
      }
    }
  }, [onCommandPalette, onNavigate, onNewChat, onSettings, onShowKeyboardShortcuts])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
}

// Helper to format keyboard shortcuts for display
export const keyboardShortcuts = {
  commandPalette: { keys: ['⌘', 'K'], description: 'Open command palette' },
  dashboard: { keys: ['⌘', '1'], description: 'Go to Dashboard' },
  chat: { keys: ['⌘', '2'], description: 'Go to Chat' },
  brain: { keys: ['⌘', '3'], description: 'Go to Brain' },
  tasks: { keys: ['⌘', '4'], description: 'Go to Tasks' },
  settings: { keys: ['⌘', '5'], description: 'Go to Settings' },
  memoryExplorer: { keys: ['⌘', '6'], description: 'Go to Memory Explorer' },
  automations: { keys: ['⌘', '7'], description: 'Go to Automations' },
  sessions: { keys: ['⌘', '8'], description: 'Go to Sessions' },
  newChat: { keys: ['⌘', 'N'], description: 'New chat' },
  openSettings: { keys: ['⌘', ','], description: 'Open settings' }
}
