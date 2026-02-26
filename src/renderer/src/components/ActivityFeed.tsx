import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { 
  MessageSquare,
  Bot,
  ExternalLink,
  Clock,
  RefreshCw,
  Activity as ActivityIcon
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useSessions, useAllSessionHistories } from '@/hooks/useGateway'
import { friendlySessionName, getChannelEmoji, getChannelName } from '@/utils/sessionUtils'
import { cn } from '@/lib/utils'
import type { Message, Session } from '../../../shared/types'

interface ActivityItem {
  id: string
  timestamp: string
  sessionKey: string
  channelName: string
  channelEmoji: string
  summary: string
  messageCount: number
  lastMessage?: Message
}

interface ActivityFeedProps {
  onActivityClick?: (sessionKey: string) => void
}

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 }
  }
}

const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 }
}

export default function ActivityFeed({ onActivityClick }: ActivityFeedProps) {
  const { data: sessions } = useSessions()
  const { data: allSessionHistories } = useAllSessionHistories(sessions)
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isRefreshing) {
        refreshActivities()
      }
    }, 30000)

    return () => clearInterval(interval)
  }, [isRefreshing])

  // Process sessions and messages into activity items
  useEffect(() => {
    if (!sessions || !allSessionHistories) return

    const processedActivities: ActivityItem[] = []

    sessions.forEach(session => {
      const messages = allSessionHistories[session.key] || []
      if (messages.length === 0) return

      // Get recent assistant messages for activity summaries
      const assistantMessages = messages
        .filter(msg => msg.role === 'assistant')
        .slice(-3) // Get last 3 assistant messages

      if (assistantMessages.length === 0) return

      const lastMessage = messages[messages.length - 1]
      const lastAssistantMessage = assistantMessages[assistantMessages.length - 1]

      // Generate activity summary based on message content
      const summary = generateActivitySummary(session, lastAssistantMessage, messages)

      processedActivities.push({
        id: `${session.key}-${lastMessage.timestamp}`,
        timestamp: lastMessage.timestamp || new Date().toISOString(),
        sessionKey: session.key,
        channelName: getChannelName(session.key),
        channelEmoji: getChannelEmoji(session.key),
        summary,
        messageCount: messages.length,
        lastMessage: lastAssistantMessage
      })
    })

    // Sort by timestamp (most recent first)
    processedActivities.sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime()
      const timeB = new Date(b.timestamp).getTime()
      return timeB - timeA
    })

    setActivities(processedActivities.slice(0, 20)) // Keep last 20 activities
  }, [sessions, allSessionHistories])

  const generateActivitySummary = (_session: Session, message: Message, _allMessages: Message[]): string => {
    // Show actual message content, truncated
    const content = message.content.trim()
    if (!content) return 'Responded'

    // Strip markdown formatting for a cleaner summary
    const cleaned = content
      .replace(/^#{1,6}\s+/gm, '') // headers
      .replace(/\*\*(.+?)\*\*/g, '$1') // bold
      .replace(/\*(.+?)\*/g, '$1') // italic
      .replace(/`(.+?)`/g, '$1') // inline code
      .replace(/```[\s\S]*?```/g, '[code]') // code blocks
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
      .replace(/\n+/g, ' ') // collapse newlines
      .trim()

    // Return first meaningful line, truncated
    const firstLine = cleaned.slice(0, 120)
    return firstLine.length < cleaned.length ? `${firstLine}…` : firstLine
  }

  const refreshActivities = async () => {
    setIsRefreshing(true)
    // The useEffect will automatically update activities when data refreshes
    setTimeout(() => setIsRefreshing(false), 1000)
  }

  const handleActivityClick = (activity: ActivityItem) => {
    onActivityClick?.(activity.sessionKey)
  }

  const formatTimeAgo = (timestamp: string) => {
    const now = new Date().getTime()
    const time = new Date(timestamp).getTime()
    const diffMinutes = Math.floor((now - time) / (1000 * 60))

    if (diffMinutes < 1) return 'just now'
    if (diffMinutes < 60) return `${diffMinutes}m ago`
    if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)}h ago`
    return `${Math.floor(diffMinutes / 1440)}d ago`
  }

  const getChannelBadgeColor = (channelName: string) => {
    switch (channelName.toLowerCase()) {
      case 'whatsapp': return 'bg-green-500/15 text-green-400 border-green-500/30'
      case 'slack': return 'bg-purple-500/15 text-purple-400 border-purple-500/30'
      case 'discord': return 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30'
      case 'pinchr': return 'bg-accent/15 text-accent border-accent/30'
      default: return 'bg-blue-500/15 text-blue-400 border-blue-500/30'
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <ActivityIcon className="h-4 w-4 text-accent" />
            Recent Activity
          </CardTitle>
          <Button
            onClick={refreshActivities}
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            disabled={isRefreshing}
          >
            <RefreshCw className={cn(
              "h-4 w-4",
              isRefreshing && "animate-spin"
            )} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {activities.length > 0 ? (
          <ScrollArea className="h-[300px]">
            <motion.div
              variants={container}
              initial="hidden"
              animate="show"
              className="space-y-3"
            >
              {activities.map((activity) => (
                <motion.div
                  key={activity.id}
                  variants={item}
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-lg transition-all duration-200 group",
                    onActivityClick 
                      ? "cursor-pointer hover:bg-surface-2 hover:shadow-glow-sm" 
                      : "bg-surface-2/50"
                  )}
                  onClick={() => handleActivityClick(activity)}
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15 shrink-0">
                    <Bot className="h-4 w-4 text-accent" />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge 
                        variant="secondary"
                        className={cn(
                          "text-xs px-2 py-0.5 border",
                          getChannelBadgeColor(activity.channelName)
                        )}
                      >
                        <span className="mr-1">{activity.channelEmoji}</span>
                        {activity.channelName}
                      </Badge>
                      <span className="text-xs text-text-muted">
                        {formatTimeAgo(activity.timestamp)}
                      </span>
                    </div>
                    
                    <p className="text-sm text-text-primary font-medium truncate group-hover:text-accent transition-colors">
                      {activity.summary}
                    </p>
                    
                    <div className="flex items-center gap-4 mt-1">
                      <span className="text-xs text-text-muted">
                        {activity.messageCount} messages
                      </span>
                      {onActivityClick && (
                        <div className="flex items-center text-xs text-text-muted opacity-0 group-hover:opacity-100 transition-opacity">
                          <ExternalLink className="h-3 w-3 mr-1" />
                          View session
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </ScrollArea>
        ) : (
          <div className="text-center py-8">
            <ActivityIcon className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p className="text-sm text-text-muted mb-1">No recent activity</p>
            <p className="text-xs text-text-muted">
              Start a conversation to see activity here
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}