import React, { useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, RefreshCw, Search } from 'lucide-react'
import { Sidebar } from './components/Sidebar'
import { CommandPalette } from './components/CommandPalette'
import { KeyboardShortcuts } from './components/KeyboardShortcuts'
import { VersionBadge } from './components/VersionBadge'
import { HelpMenu } from './components/HelpMenu'
import { ErrorBoundary } from './components/ErrorBoundary'
import { GlobalErrorHandler } from './components/GlobalErrorHandler'
import { ReportIssue } from './components/ReportIssue'
import { TosAcceptance, checkTosAcceptance } from './components/TosAcceptance'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { telemetry } from './services/telemetry'
import type { Page } from '@/types/navigation'
import Dashboard from './pages/Dashboard'
import Chat from './pages/Chat'
import Sessions from './pages/Sessions'
import Tasks from './pages/Tasks'
import AutomationsHub from './pages/AutomationsHub'
import SkillMarketplace from './pages/SkillMarketplace'
import Connections from './pages/Connections'
import Brain from './pages/Brain'
import MemoryExplorer from './pages/MemoryExplorer'
import Terminal from './pages/Terminal'
import Settings from './pages/Settings'
import Support from './pages/Support'
import Onboarding from './pages/Onboarding'

const pages: Record<Page, React.FC<{ onNavigate?: (page: Page) => void }>> = {
  dashboard: Dashboard,
  chat: Chat,
  sessions: Sessions,
  tasks: Tasks,
  automations: AutomationsHub,
  skills: SkillMarketplace,
  connections: Connections,
  brain: Brain,
  'memory-explorer': MemoryExplorer,
  terminal: Terminal,
  settings: Settings,
  onboarding: Onboarding,
  support: Support,
}

function normalizeHash(hash: string): string {
  const trimmed = hash.trim()
  if (!trimmed || trimmed === '#') return ''
  return trimmed.replace(/\/+$/, '')
}

function hashPath(hash: string): string {
  const normalized = normalizeHash(hash)
  if (!normalized) return normalized
  const queryIndex = normalized.indexOf('?')
  if (queryIndex < 0) return normalized
  return normalized.slice(0, queryIndex)
}

function pageFromHash(hash: string): Page | null {
  const normalized = hashPath(hash).toLowerCase()

  switch (normalized) {
    case '':
    case '#/':
      return 'dashboard'
    case '#/dashboard':
    case '#/legacy-dashboard':
      return 'dashboard'
    case '#/chat':
      return 'chat'
    case '#/sessions':
      return 'sessions'
    case '#/tasks':
      return 'tasks'
    case '#/automations':
    case '#/automations/workflow-builder':
    case '#/workflows':
      return 'automations'
    case '#/skills':
    case '#/marketplace':
      return 'skills'
    case '#/connections':
      return 'connections'
    case '#/brain':
      return 'brain'
    case '#/memory-explorer':
      return 'memory-explorer'
    case '#/terminal':
    case '#/developer/terminal':
      return 'terminal'
    case '#/settings':
      return 'settings'
    case '#/support':
      return 'support'
    case '#/onboarding':
    case '#/setup':
    case '#/welcome':
      return 'onboarding'
    default:
      return null
  }
}

function hashFromPage(page: Page): string {
  switch (page) {
    case 'dashboard':
      return '#/dashboard'
    case 'chat':
      return '#/chat'
    case 'sessions':
      return '#/sessions'
    case 'tasks':
      return '#/tasks'
    case 'automations':
      return '#/automations'
    case 'skills':
      return '#/skills'
    case 'connections':
      return '#/connections'
    case 'brain':
      return '#/brain'
    case 'memory-explorer':
      return '#/memory-explorer'
    case 'terminal':
      return '#/terminal'
    case 'settings':
      return '#/settings'
    case 'onboarding':
      return '#/onboarding'
    case 'support':
      return '#/support'
    default:
      return '#/dashboard'
  }
}

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: '' }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message || 'Unexpected error' }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('App-level render error:', error, info)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="flex h-screen items-center justify-center bg-background p-6">
        <div className="max-w-md rounded-xl border border-red-500/25 bg-red-500/10 p-6 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-red-500/20">
            <AlertTriangle className="h-5 w-5 text-red-300" />
          </div>
          <h2 className="text-base font-semibold text-text-primary">Something went wrong</h2>
          <p className="mt-2 text-sm text-text-secondary">
            {this.state.error || 'A render error occurred in the app.'}
          </p>
          <button
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary hover:bg-surface-2"
            onClick={() => window.location.reload()}
          >
            <RefreshCw className="h-4 w-4" />
            Reload App
          </button>
        </div>
      </div>
    )
  }
}

export default function App() {
  const initialHash = hashPath(window.location.hash).toLowerCase()
  const [currentPage, setCurrentPage] = useState<Page>(() => pageFromHash(initialHash) ?? 'dashboard')
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean | null>(null)
  const [tosAccepted, setTosAccepted] = useState<boolean | null>(null)
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false)
  const [isKeyboardShortcutsOpen, setIsKeyboardShortcutsOpen] = useState(false)
  const [isReportIssueOpen, setIsReportIssueOpen] = useState(false)
  const PageComponent = pages[currentPage]

  // Sync app state from URL hash changes.
  useEffect(() => {
    const checkHash = () => {
      const nextHash = hashPath(window.location.hash).toLowerCase()
      const page = pageFromHash(nextHash)
      if (page) {
        setCurrentPage((prev) => (prev === page ? prev : page))
      }
    }

    checkHash()
    window.addEventListener('hashchange', checkHash)
    return () => window.removeEventListener('hashchange', checkHash)
  }, [])

  // Keep URL hash aligned with page navigation.
  useEffect(() => {
    const targetHash = hashFromPage(currentPage)
    const currentHashPath = hashPath(window.location.hash).toLowerCase()
    if (currentHashPath !== targetHash) {
      window.history.replaceState(null, '', targetHash)
    }
  }, [currentPage])

  // Keyboard shortcut handlers
  const handleCommandPalette = () => setIsCommandPaletteOpen(true)
  const handleShowKeyboardShortcuts = () => setIsKeyboardShortcutsOpen(true)
  const handleNavigate = (page: Page) => setCurrentPage(page)
  const handleNewChat = () => {
    setCurrentPage('chat')
    window.dispatchEvent(new CustomEvent('pinchr:new-chat-request'))
  }
  const handleSettings = () => setCurrentPage('settings')

  // Register keyboard shortcuts
  useKeyboardShortcuts({
    onCommandPalette: handleCommandPalette,
    onNavigate: handleNavigate,
    onNewChat: handleNewChat,
    onSettings: handleSettings,
    onShowKeyboardShortcuts: handleShowKeyboardShortcuts
  })

  // Initialize telemetry on mount
  useEffect(() => {
    telemetry.trackAppOpen()
  }, [])

  // Track page views
  useEffect(() => {
    telemetry.trackPageView(currentPage)
  }, [currentPage])

  // Check TOS acceptance on mount (MUST happen first, before everything else)
  useEffect(() => {
    const checkTos = async () => {
      try {
        const result = await checkTosAcceptance()
        // For TOS, we only care if accepted and current version
        // If needsUpdate is true, user must re-accept
        setTosAccepted(result.accepted && !result.needsUpdate)
      } catch (error) {
        console.error('Error checking TOS acceptance:', error)
        setTosAccepted(false)
      }
    }

    checkTos()
  }, [])

  // Check if onboarding is complete on mount
  useEffect(() => {
    const checkOnboarding = async () => {
      try {
        const result = await window.api.onboarding.check()
        if (result.ok) {
          setOnboardingCompleted(result.data?.completed ?? false)
        } else {
          setOnboardingCompleted(false)
        }
      } catch (error) {
        console.error('Error checking onboarding status:', error)
        setOnboardingCompleted(false)
      }
    }

    checkOnboarding()

    // Listen for onboarding completion
    const checkAgain = () => checkOnboarding()
    window.addEventListener('focus', checkAgain)
    return () => window.removeEventListener('focus', checkAgain)
  }, [])

  // Show loading state while checking TOS and onboarding
  if (tosAccepted === null || onboardingCompleted === null || waitingOnLicenseCheck) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <VersionBadge />
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    )
  }

  // CRITICAL: TOS acceptance MUST be checked first, before any other flow
  if (!tosAccepted) {
    return (
      <>
        <VersionBadge />
        <TosAcceptance onAccept={() => setTosAccepted(true)} />
      </>
    )
  }

  if (!onboardingCompleted || currentPage === 'onboarding') {
    return (
      <>
        <GlobalErrorHandler />
        <VersionBadge />
        <ErrorBoundary onReportIssue={() => setIsReportIssueOpen(true)}>
          <Onboarding />
        </ErrorBoundary>
        <ReportIssue
          isOpen={isReportIssueOpen}
          onClose={() => setIsReportIssueOpen(false)}
        />
      </>
    )
  }

  return (
    <AppErrorBoundary>
      <GlobalErrorHandler />
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar
          currentPage={currentPage}
          onNavigate={setCurrentPage}
          onReportIssue={() => setIsReportIssueOpen(true)}
        />

        <main className="flex-1 overflow-hidden flex flex-col">
          <div className="h-14 border-b border-border bg-surface px-6 flex items-center gap-3" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
            <button
              onClick={() => setIsCommandPaletteOpen(true)}
              className="h-9 w-full max-w-xl rounded-lg border border-border bg-surface-2 px-3 flex items-center justify-between text-left hover:bg-surface-3 transition-colors"
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
              <div className="flex items-center gap-2 text-sm text-text-secondary">
                <Search className="h-4 w-4" />
                <span>Search pages, settings, sessions, and messages...</span>
              </div>
              <kbd className="rounded bg-surface-3 px-2 py-0.5 text-[10px] text-text-muted">⌘K</kbd>
            </button>
            <div className="ml-auto flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
              <VersionBadge mode="inline" />
              <HelpMenu onNavigate={handleNavigate} />
            </div>
          </div>

          <div className="flex-1 overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentPage}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                className="h-full"
              >
                <ErrorBoundary key={currentPage} onReportIssue={() => setIsReportIssueOpen(true)}>
                  <PageComponent onNavigate={setCurrentPage} />
                </ErrorBoundary>
              </motion.div>
            </AnimatePresence>
          </div>
        </main>

        <CommandPalette
          isOpen={isCommandPaletteOpen}
          onClose={() => setIsCommandPaletteOpen(false)}
          onNavigate={handleNavigate}
        />

        <KeyboardShortcuts
          isOpen={isKeyboardShortcutsOpen}
          onClose={() => setIsKeyboardShortcutsOpen(false)}
        />

        <ReportIssue
          isOpen={isReportIssueOpen}
          onClose={() => setIsReportIssueOpen(false)}
        />
      </div>
    </AppErrorBoundary>
  )
}
