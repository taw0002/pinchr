import { safeStorage } from 'electron'
import { join } from 'path'
import { homedir } from 'os'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'

const CREDENTIALS_PATH = join(homedir(), '.pinchr', 'credentials.enc')
const CONFIG_DIR = join(homedir(), '.pinchr')

interface CredentialPayload {
  access_token: string
  refresh_token?: string | null
  token_type?: string
  scope?: string
  [key: string]: unknown
}

interface CredentialStore {
  [provider: string]: CredentialPayload
}

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true })
  }
}

function loadStore(): CredentialStore {
  try {
    if (!existsSync(CREDENTIALS_PATH)) return {}

    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = readFileSync(CREDENTIALS_PATH)
      const decrypted = safeStorage.decryptString(encrypted)
      return JSON.parse(decrypted)
    } else {
      // Fallback: plain JSON (dev mode)
      const raw = readFileSync(CREDENTIALS_PATH, 'utf-8')
      return JSON.parse(raw)
    }
  } catch (err) {
    console.error('Failed to load credential store:', err)
    return {}
  }
}

function saveStore(store: CredentialStore): void {
  ensureConfigDir()
  try {
    const json = JSON.stringify(store, null, 2)
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(json)
      writeFileSync(CREDENTIALS_PATH, encrypted)
    } else {
      // Fallback: plain JSON (dev mode)
      writeFileSync(CREDENTIALS_PATH, json, { mode: 0o600 })
    }
  } catch (err) {
    console.error('Failed to save credential store:', err)
  }
}

export const credentialStore = {
  get(provider: string): CredentialPayload | null {
    const store = loadStore()
    return store[provider] || null
  },

  set(provider: string, payload: CredentialPayload): void {
    const store = loadStore()
    store[provider] = payload
    saveStore(store)
  },

  delete(provider: string): void {
    const store = loadStore()
    delete store[provider]
    saveStore(store)
  },

  has(provider: string): boolean {
    const store = loadStore()
    return !!store[provider]
  },

  list(): string[] {
    const store = loadStore()
    return Object.keys(store)
  },

  // For API key connections (non-OAuth)
  setApiKey(provider: string, apiKey: string): void {
    this.set(provider, {
      access_token: apiKey,
      token_type: 'api_key',
    })
  },
}
