import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Bot,
  Mail,
  Calendar,
  PenTool,
  Search,
  StickyNote,
  Lightbulb,
  ChevronDown,
  ChevronUp,
  Clock,
  Users,
  Settings,
  FileText,
  Heart,
  Zap
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { AgentTab } from '../../../shared/types'

interface SuggestedPrompt {
  id: string
  emoji: string
  icon: typeof Mail
  title: string
  description: string
  prompt: string
}

const primaryPrompts: SuggestedPrompt[] = [
  {
    id: 'email',
    emoji: '📧',
    icon: Mail,
    title: 'Summarize my unread emails',
    description: 'Get a quick overview of important messages',
    prompt: 'Summarize my unread emails'
  },
  {
    id: 'calendar',
    emoji: '📅',
    icon: Calendar,
    title: "What's on my calendar today?",
    description: 'Check upcoming meetings and events',
    prompt: "What's on my calendar today?"
  },
  {
    id: 'draft',
    emoji: '✍️',
    icon: PenTool,
    title: 'Help me draft a message',
    description: 'Compose professional emails and texts',
    prompt: 'Help me draft a message'
  },
  {
    id: 'search',
    emoji: '🔍',
    icon: Search,
    title: 'Search the web for...',
    description: 'Research topics and find information',
    prompt: 'Search the web for'
  },
  {
    id: 'reminder',
    emoji: '📝',
    icon: StickyNote,
    title: 'Create a reminder for...',
    description: 'Set up notifications for important tasks',
    prompt: 'Create a reminder for'
  },
  {
    id: 'brainstorm',
    emoji: '💡',
    icon: Lightbulb,
    title: 'Brainstorm ideas about...',
    description: 'Generate creative solutions and concepts',
    prompt: 'Brainstorm ideas about'
  }
]

const secondaryPrompts: SuggestedPrompt[] = [
  {
    id: 'schedule',
    emoji: '⏰',
    icon: Clock,
    title: 'Schedule a meeting with...',
    description: 'Find available times and send invites',
    prompt: 'Schedule a meeting with'
  },
  {
    id: 'contacts',
    emoji: '👥',
    icon: Users,
    title: 'Find contact info for...',
    description: 'Search your contacts and networks',
    prompt: 'Find contact info for'
  },
  {
    id: 'settings',
    emoji: '⚙️',
    icon: Settings,
    title: 'Help me configure...',
    description: 'Set up apps and system preferences',
    prompt: 'Help me configure'
  },
  {
    id: 'summarize',
    emoji: '📄',
    icon: FileText,
    title: 'Summarize this document...',
    description: 'Extract key points from files',
    prompt: 'Summarize this document'
  },
  {
    id: 'health',
    emoji: '❤️',
    icon: Heart,
    title: 'Health and wellness tips',
    description: 'Get personalized advice for wellbeing',
    prompt: 'Give me some health and wellness tips'
  },
  {
    id: 'productivity',
    emoji: '⚡',
    icon: Zap,
    title: 'Boost my productivity',
    description: 'Optimize workflows and habits',
    prompt: 'Help me boost my productivity'
  }
]

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { 
      staggerChildren: 0.1,
      delayChildren: 0.2
    }
  }
}

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 }
}

const cardHover = {
  rest: { scale: 1 },
  hover: { 
    scale: 1.02, 
    transition: { type: "spring", stiffness: 300, damping: 20 } 
  }
}

interface ChatEmptyStateProps {
  onPromptClick: (prompt: string) => void
  agentTab?: AgentTab
}

export default function ChatEmptyState({ onPromptClick, agentTab }: ChatEmptyStateProps) {
  const [showMore, setShowMore] = useState(false)

  const handlePromptClick = (prompt: SuggestedPrompt) => {
    onPromptClick(prompt.prompt)
  }

  return (
    <motion.div 
      className="flex-1 flex items-center justify-center p-8"
      variants={container}
      initial="hidden"
      animate="show"
    >
      <div className="max-w-4xl w-full">
        {/* Welcome Header */}
        <motion.div 
          className="text-center mb-12"
          variants={item}
        >
          <div className="flex items-center justify-center mb-6">
            <motion.div
              className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-accent shadow-glow-md"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
            >
              <Bot className="h-8 w-8 text-white" />
            </motion.div>
          </div>
          <h1 className="text-2xl font-bold text-text-primary mb-2">
            {agentTab ? `${agentTab.emoji} ${agentTab.name} Agent` : "Hi, I'm your AI assistant"}
          </h1>
          <p className="text-text-secondary text-lg">
            {agentTab
              ? `Ready to help with ${agentTab.name.toLowerCase()}-related tasks`
              : "Here's what I can help you with today:"}
          </p>
        </motion.div>

        {/* Primary Prompts Grid */}
        <motion.div 
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6"
          variants={container}
        >
          {primaryPrompts.map((prompt) => (
            <motion.div
              key={prompt.id}
              variants={item}
              whileHover="hover"
              whileTap={{ scale: 0.98 }}
              initial="rest"
            >
              <motion.div variants={cardHover}>
                <Card 
                  className="cursor-pointer transition-all duration-200 hover:shadow-glow-sm hover:border-accent/30 group"
                  onClick={() => handlePromptClick(prompt)}
                >
                  <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-2 group-hover:bg-accent/15 transition-all duration-200">
                        <span className="text-xl">{prompt.emoji}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-text-primary mb-1 group-hover:text-accent transition-colors">
                          {prompt.title}
                        </h3>
                        <p className="text-sm text-text-secondary leading-relaxed">
                          {prompt.description}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </motion.div>
          ))}
        </motion.div>

        {/* Show More Button */}
        <motion.div 
          className="text-center mb-6"
          variants={item}
        >
          <Button
            onClick={() => setShowMore(!showMore)}
            variant="ghost"
            className="group"
          >
            {showMore ? (
              <>
                Show less
                <ChevronUp className="ml-2 h-4 w-4 group-hover:translate-y-[-1px] transition-transform" />
              </>
            ) : (
              <>
                Show more suggestions
                <ChevronDown className="ml-2 h-4 w-4 group-hover:translate-y-[1px] transition-transform" />
              </>
            )}
          </Button>
        </motion.div>

        {/* Secondary Prompts Grid - Collapsible */}
        <motion.div
          initial={false}
          animate={{ 
            height: showMore ? 'auto' : 0,
            opacity: showMore ? 1 : 0
          }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
          className="overflow-hidden"
        >
          <motion.div 
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
            variants={container}
            animate={showMore ? "show" : "hidden"}
          >
            {secondaryPrompts.map((prompt) => (
              <motion.div
                key={prompt.id}
                variants={item}
                whileHover="hover"
                whileTap={{ scale: 0.98 }}
                initial="rest"
              >
                <motion.div variants={cardHover}>
                  <Card 
                    className="cursor-pointer transition-all duration-200 hover:shadow-glow-sm hover:border-accent/30 group"
                    onClick={() => handlePromptClick(prompt)}
                  >
                    <CardContent className="p-6">
                      <div className="flex items-start gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-2 group-hover:bg-accent/15 transition-all duration-200">
                          <span className="text-xl">{prompt.emoji}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-text-primary mb-1 group-hover:text-accent transition-colors">
                            {prompt.title}
                          </h3>
                          <p className="text-sm text-text-secondary leading-relaxed">
                            {prompt.description}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>
      </div>
    </motion.div>
  )
}