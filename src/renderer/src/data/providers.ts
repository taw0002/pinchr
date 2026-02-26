import type { ProviderId } from '../../../shared/types'

export type ProviderBadgeColor = 'amber' | 'green' | 'blue' | 'purple'

export interface ProviderModelMetadata {
  id: string
  name: string
  badge: string | null
  badgeColor?: ProviderBadgeColor
  costTier: '$' | '$$' | '$$$'
  description: string
}

export interface ProviderMetadata {
  id: ProviderId
  name: string
  description: string
  setupUrl: string
  billingUrl: string
  instructions: string[]
  keyPrefix: string
  keyPlaceholder: string
  models: ProviderModelMetadata[]
  warning?: string
  setupTip?: string
}

export const PROVIDERS: ProviderMetadata[] = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Claude Opus, Sonnet, Haiku',
    setupUrl: 'https://console.anthropic.com/settings/keys',
    billingUrl: 'https://console.anthropic.com/settings/billing',
    instructions: [
      'Go to console.anthropic.com',
      'Sign up or log in',
      'Navigate to Settings -> API Keys',
      'Click "Create Key" and copy it',
      'Set up billing under Settings -> Billing (pay-as-you-go)'
    ],
    keyPrefix: 'sk-ant-',
    keyPlaceholder: 'sk-ant-api03-...',
    setupTip: 'Most users spend $5-20/month. You only pay for what you use.',
    models: [
      {
        id: 'anthropic/claude-opus-4-6',
        name: 'Claude Opus 4.6',
        badge: 'Recommended',
        badgeColor: 'amber',
        costTier: '$$$',
        description: 'Best reasoning and quality'
      },
      {
        id: 'anthropic/claude-sonnet-4-5-20250929',
        name: 'Claude Sonnet 4.5',
        badge: 'Best Value',
        badgeColor: 'green',
        costTier: '$$',
        description: 'Great balance of speed and quality'
      },
      {
        id: 'anthropic/claude-haiku-4-5-20251001',
        name: 'Claude Haiku 4.5',
        badge: 'Fast',
        badgeColor: 'blue',
        costTier: '$',
        description: 'Fastest, good for simple tasks'
      }
    ]
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT-4o, GPT-5, o1',
    setupUrl: 'https://platform.openai.com/api-keys',
    billingUrl: 'https://platform.openai.com/settings/organization/billing',
    instructions: [
      'Go to platform.openai.com',
      'Sign up or log in',
      'Navigate to API Keys',
      'Click "Create new secret key" and copy it',
      'Set up billing under Settings -> Billing (prepaid credits)'
    ],
    keyPrefix: 'sk-',
    keyPlaceholder: 'sk-proj-...',
    models: [
      {
        id: 'openai/gpt-5.2',
        name: 'GPT-5.2',
        badge: null,
        costTier: '$$$',
        description: 'Latest and most capable'
      },
      {
        id: 'openai/gpt-4o',
        name: 'GPT-4o',
        badge: 'Fast',
        badgeColor: 'blue',
        costTier: '$$',
        description: 'Fast and capable'
      },
      {
        id: 'openai/gpt-4o-mini',
        name: 'GPT-4o Mini',
        badge: null,
        costTier: '$',
        description: 'Budget-friendly'
      },
      {
        id: 'openai/o1',
        name: 'o1',
        badge: null,
        costTier: '$$$',
        description: 'Reasoning-focused'
      }
    ]
  },
  {
    id: 'google',
    name: 'Google AI',
    description: 'Gemini Pro, Flash',
    setupUrl: 'https://aistudio.google.com/app/apikey',
    billingUrl: 'https://aistudio.google.com/app/billing',
    instructions: [
      'Go to aistudio.google.com',
      'Sign in with your Google account',
      'Click "Get API Key" -> "Create API Key"',
      'Copy the key',
      'Free tier available; paid tier for higher limits'
    ],
    keyPrefix: 'AI',
    keyPlaceholder: 'AIza...',
    models: [
      {
        id: 'google/gemini-2.5-pro',
        name: 'Gemini 2.5 Pro',
        badge: null,
        costTier: '$$',
        description: 'Strong reasoning'
      },
      {
        id: 'google/gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        badge: 'Fast',
        badgeColor: 'blue',
        costTier: '$',
        description: 'Fast and efficient'
      }
    ]
  },
  {
    id: 'groq',
    name: 'Groq',
    description: 'Fast inference for open models',
    setupUrl: 'https://console.groq.com/keys',
    billingUrl: 'https://console.groq.com/settings/billing',
    instructions: [
      'Go to console.groq.com',
      'Sign up or log in',
      'Navigate to API Keys',
      'Click "Create API Key" and copy it',
      'Free tier available with rate limits'
    ],
    keyPrefix: 'gsk_',
    keyPlaceholder: 'gsk_...',
    warning:
      'Open-source models may not support all features (tool use, thinking). Best used as secondary/fallback models.',
    models: [
      {
        id: 'groq/llama-3.3-70b',
        name: 'Llama 3.3 70B',
        badge: 'Open Source',
        badgeColor: 'purple',
        costTier: '$',
        description: 'Fast open-source model'
      }
    ]
  }
]

export function getProviderById(providerId: ProviderId): ProviderMetadata | undefined {
  return PROVIDERS.find((provider) => provider.id === providerId)
}
