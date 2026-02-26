export type LocalModelProvider = 'lmstudio' | 'ollama'

export interface LocalModel {
  id: string
  name: string
  provider: LocalModelProvider
  size?: number
  quantization?: string
  paramCount?: string
}

export interface LocalModelStatus {
  providers: LocalModelProvider[]
  models: LocalModel[]
  lastScan: number
}

let cachedStatus: LocalModelStatus = {
  providers: [],
  models: [],
  lastScan: 0
}

let pollInterval: ReturnType<typeof setInterval> | null = null

async function fetchJson(url: string, timeoutMs = 3000): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function parseQuantization(name: string): string | undefined {
  const match = name.match(/[_-](Q\d[_\w]*|q\d[_\w]*|fp16|fp32|f16|f32|int4|int8|GGUF)/i)
  return match ? match[1] : undefined
}

function parseParamCount(name: string): string | undefined {
  const match = name.match(/(\d+\.?\d*)[Bb]/i)
  return match ? `${match[1]}B` : undefined
}

async function discoverLMStudio(): Promise<LocalModel[]> {
  const data = await fetchJson('http://localhost:1234/v1/models') as {
    data?: Array<{ id: string; object?: string }>
  } | null
  if (!data?.data) return []

  return data.data.map((m) => ({
    id: `lmstudio:${m.id}`,
    name: m.id,
    provider: 'lmstudio' as const,
    quantization: parseQuantization(m.id),
    paramCount: parseParamCount(m.id)
  }))
}

async function discoverOllama(): Promise<LocalModel[]> {
  const data = await fetchJson('http://localhost:11434/api/tags') as {
    models?: Array<{
      name: string
      size?: number
      details?: { quantization_level?: string; parameter_size?: string }
    }>
  } | null
  if (!data?.models) return []

  return data.models.map((m) => ({
    id: `ollama:${m.name}`,
    name: m.name,
    provider: 'ollama' as const,
    size: m.size,
    quantization: m.details?.quantization_level || parseQuantization(m.name),
    paramCount: m.details?.parameter_size || parseParamCount(m.name)
  }))
}

export async function discoverLocalModels(): Promise<LocalModelStatus> {
  const [lmStudioModels, ollamaModels] = await Promise.all([
    discoverLMStudio(),
    discoverOllama()
  ])

  const providers: LocalModelProvider[] = []
  if (lmStudioModels.length > 0) providers.push('lmstudio')
  if (ollamaModels.length > 0) providers.push('ollama')

  cachedStatus = {
    providers,
    models: [...lmStudioModels, ...ollamaModels],
    lastScan: Date.now()
  }

  return cachedStatus
}

export function getLocalModelStatus(): LocalModelStatus {
  return cachedStatus
}

export function startDiscovery(): void {
  if (pollInterval) return
  // Initial scan
  discoverLocalModels().catch(() => {})
  // Poll every 10 seconds
  pollInterval = setInterval(() => {
    discoverLocalModels().catch(() => {})
  }, 10000)
}

export function stopDiscovery(): void {
  if (pollInterval) {
    clearInterval(pollInterval)
    pollInterval = null
  }
}
