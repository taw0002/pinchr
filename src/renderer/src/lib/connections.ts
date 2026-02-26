import type { UserRole, ConnectionConfig } from '../../../shared/types'

export interface ConnectionDefinition {
  id: string
  name: string
  icon: string
  description: string
  authType: 'oauth' | 'api_key' | 'webhook'
  category: 'communication' | 'development' | 'analytics' | 'finance' | 'crm' | 'productivity'
  suggestedRoles: UserRole[]
}

export const CONNECTION_REGISTRY: ConnectionDefinition[] = [
  {
    id: 'github',
    name: 'GitHub',
    icon: '\uD83D\uDC19',
    description: 'Code repositories, PRs, and issues',
    authType: 'oauth',
    category: 'development',
    suggestedRoles: ['developer', 'ceo']
  },
  {
    id: 'slack',
    name: 'Slack',
    icon: '\uD83D\uDCAC',
    description: 'Team messaging and channels',
    authType: 'oauth',
    category: 'communication',
    suggestedRoles: ['developer', 'product_manager', 'marketer', 'finance', 'ceo', 'sales']
  },
  {
    id: 'gmail',
    name: 'Gmail / Google',
    icon: '\uD83D\uDCE7',
    description: 'Email, Drive, and Google Workspace',
    authType: 'oauth',
    category: 'communication',
    suggestedRoles: ['developer', 'product_manager', 'marketer', 'finance', 'ceo', 'sales']
  },
  {
    id: 'stripe',
    name: 'Stripe',
    icon: '\uD83D\uDCB3',
    description: 'Payments, subscriptions, and invoices',
    authType: 'api_key',
    category: 'finance',
    suggestedRoles: ['finance', 'ceo']
  },
  {
    id: 'hubspot',
    name: 'HubSpot',
    icon: '\uD83E\uDDF2',
    description: 'CRM, marketing, and sales automation',
    authType: 'oauth',
    category: 'crm',
    suggestedRoles: ['sales', 'marketer']
  },
  {
    id: 'sentry',
    name: 'Sentry',
    icon: '\uD83D\uDEA8',
    description: 'Error tracking and performance monitoring',
    authType: 'api_key',
    category: 'development',
    suggestedRoles: ['developer']
  },
  {
    id: 'linear',
    name: 'Linear / Jira',
    icon: '\uD83C\uDFAF',
    description: 'Project tracking and issue management',
    authType: 'oauth',
    category: 'productivity',
    suggestedRoles: ['developer', 'product_manager']
  },
  {
    id: 'google-analytics',
    name: 'Google Analytics',
    icon: '\uD83D\uDCC8',
    description: 'Website traffic and user behavior',
    authType: 'oauth',
    category: 'analytics',
    suggestedRoles: ['marketer', 'ceo']
  },
  {
    id: 'salesforce',
    name: 'Salesforce',
    icon: '\u2601\uFE0F',
    description: 'Enterprise CRM and sales pipeline',
    authType: 'oauth',
    category: 'crm',
    suggestedRoles: ['sales']
  },
  {
    id: 'quickbooks',
    name: 'QuickBooks',
    icon: '\uD83D\uDCDA',
    description: 'Accounting, invoices, and bookkeeping',
    authType: 'oauth',
    category: 'finance',
    suggestedRoles: ['finance']
  },
  {
    id: 'calendar',
    name: 'Calendar',
    icon: '\uD83D\uDCC5',
    description: 'Schedule, meetings, and availability',
    authType: 'oauth',
    category: 'productivity',
    suggestedRoles: ['developer', 'product_manager', 'marketer', 'finance', 'ceo', 'sales']
  },
  {
    id: 'notion',
    name: 'Notion',
    icon: '\uD83D\uDCD3',
    description: 'Docs, wikis, and knowledge base',
    authType: 'oauth',
    category: 'productivity',
    suggestedRoles: ['product_manager']
  }
]

export const CONNECTION_CATEGORIES = [
  { id: 'communication', label: 'Communication', icon: '\uD83D\uDCAC' },
  { id: 'development', label: 'Development', icon: '\uD83D\uDEE0' },
  { id: 'analytics', label: 'Analytics', icon: '\uD83D\uDCCA' },
  { id: 'finance', label: 'Finance', icon: '\uD83D\uDCB0' },
  { id: 'crm', label: 'CRM & Sales', icon: '\uD83E\uDD1D' },
  { id: 'productivity', label: 'Productivity', icon: '\u26A1' }
] as const

export function getConnectionsForRole(role: UserRole): ConnectionDefinition[] {
  return CONNECTION_REGISTRY.filter((c) => c.suggestedRoles.includes(role))
}

export function getConnectionsByCategory(
  connections: ConnectionDefinition[]
): Record<string, ConnectionDefinition[]> {
  const grouped: Record<string, ConnectionDefinition[]> = {}
  for (const conn of connections) {
    if (!grouped[conn.category]) grouped[conn.category] = []
    grouped[conn.category].push(conn)
  }
  return grouped
}

export function createDefaultConnectionConfigs(role: UserRole): ConnectionConfig[] {
  return getConnectionsForRole(role).map((def) => ({
    id: def.id,
    name: def.name,
    icon: def.icon,
    status: 'disconnected',
    authType: def.authType,
    category: def.category
  }))
}
