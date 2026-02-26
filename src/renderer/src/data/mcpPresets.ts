export interface MCPPreset {
  id: string
  name: string
  emoji: string
  description: string
  command: string
  args: string[]
  envHints: string[]
  docsUrl: string
}

export const mcpPresets: MCPPreset[] = [
  {
    id: 'supabase',
    name: 'Supabase',
    emoji: '🗄️',
    description: 'Connect to your Supabase database',
    command: 'npx',
    args: ['-y', '@supabase/mcp-server-supabase@latest', '--access-token', '{{SUPABASE_ACCESS_TOKEN}}'],
    envHints: ['SUPABASE_ACCESS_TOKEN'],
    docsUrl: 'https://supabase.com/docs/guides/getting-started/mcp'
  },
  {
    id: 'github',
    name: 'GitHub',
    emoji: '🐙',
    description: 'Manage repos, issues, and PRs',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    envHints: ['GITHUB_PERSONAL_ACCESS_TOKEN'],
    docsUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/github'
  },
  {
    id: 'notion',
    name: 'Notion',
    emoji: '📝',
    description: 'Read and write Notion pages',
    command: 'npx',
    args: ['-y', '@notionhq/notion-mcp-server'],
    envHints: ['OPENAPI_MCP_HEADERS'],
    docsUrl: 'https://developers.notion.com/docs/create-a-notion-integration'
  },
  {
    id: 'filesystem',
    name: 'Filesystem',
    emoji: '📁',
    description: 'Read and write local files',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '{{ALLOWED_DIRECTORY}}'],
    envHints: [],
    docsUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem'
  },
  {
    id: 'brave-search',
    name: 'Brave Search',
    emoji: '🔍',
    description: 'Search the web',
    command: 'npx',
    args: ['-y', '@anthropic/brave-search-mcp-server'],
    envHints: ['BRAVE_API_KEY'],
    docsUrl: 'https://brave.com/search/api/'
  },
  {
    id: 'slack',
    name: 'Slack',
    emoji: '💬',
    description: 'Send and read Slack messages',
    command: 'npx',
    args: ['-y', '@anthropic/slack-mcp-server'],
    envHints: ['SLACK_BOT_TOKEN', 'SLACK_TEAM_ID'],
    docsUrl: 'https://api.slack.com/apps'
  }
]
