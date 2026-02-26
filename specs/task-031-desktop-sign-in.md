# Task 031: Desktop Sign-In via pinchr:// Protocol

## Overview
Connect the Pinchr desktop app to pinchr.app user accounts via OAuth through the system browser. Users click "Sign in" in the app, authenticate on pinchr.app, and get redirected back via a custom `pinchr://` protocol.

## Flow
1. User clicks "Sign in" in Pinchr (onboarding, settings, or paywall)
2. App opens system browser → `https://pinchr.app/auth/desktop`
3. User authenticates (Google, email, phone — existing Supabase auth)
4. pinchr.app redirects to `pinchr://auth/callback?access_token=...&refresh_token=...`
5. Electron catches the protocol, extracts tokens
6. Stores tokens securely via Electron `safeStorage`
7. Verifies account + tier via `POST https://pinchr.app/api/license/verify` (or a new `/api/auth/session` endpoint)
8. Updates app state: user info, tier, trial status

## Electron Side (main process)

### 1. Register protocol handler
In `src/main/index.ts`:
```typescript
import { app } from 'electron'

// Register pinchr:// protocol (must be before app.ready)
if (process.defaultApp) {
  // Dev mode: register with path to electron
  app.setAsDefaultProtocolClient('pinchr', process.execPath, [path.resolve(process.argv[1])])
} else {
  app.setAsDefaultProtocolClient('pinchr')
}
```

### 2. Handle protocol URL
```typescript
// macOS: open-url event
app.on('open-url', (event, url) => {
  event.preventDefault()
  handleAuthCallback(url)
})

// Windows/Linux: second-instance
app.on('second-instance', (event, commandLine) => {
  const url = commandLine.find(arg => arg.startsWith('pinchr://'))
  if (url) handleAuthCallback(url)
})
```

### 3. Parse and store tokens
```typescript
function handleAuthCallback(url: string) {
  const parsed = new URL(url)
  if (parsed.pathname === '/auth/callback' || parsed.host === 'auth') {
    const accessToken = parsed.searchParams.get('access_token')
    const refreshToken = parsed.searchParams.get('refresh_token')
    
    if (accessToken) {
      // Store securely
      const encrypted = safeStorage.encryptString(JSON.stringify({ accessToken, refreshToken }))
      fs.writeFileSync(path.join(app.getPath('userData'), 'auth.enc'), encrypted)
      
      // Notify renderer
      mainWindow?.webContents.send('auth:signed-in', { accessToken })
      
      // Fetch user profile
      fetchUserProfile(accessToken)
    }
  }
}
```

### 4. IPC handlers
```typescript
ipcMain.handle('auth:get-session', async () => {
  // Read encrypted tokens, verify, return user info
})

ipcMain.handle('auth:sign-in', async () => {
  // Open browser to pinchr.app/auth/desktop
  shell.openExternal('https://pinchr.app/auth/desktop')
})

ipcMain.handle('auth:sign-out', async () => {
  // Delete stored tokens
  fs.unlinkSync(path.join(app.getPath('userData'), 'auth.enc'))
})

ipcMain.handle('auth:refresh', async () => {
  // Use refresh token to get new access token
})
```

### 5. Periodic verification
Every 24 hours (or on app launch), verify the session is still valid and check tier:
```typescript
async function fetchUserProfile(accessToken: string) {
  const res = await fetch('https://pinchr.app/api/auth/me', {
    headers: { Authorization: `Bearer ${accessToken}` }
  })
  const data = await res.json()
  // data = { id, email, name, tier, avatar_url, trial_ends_at }
  store.set('user', data)
}
```

## Web Side (pinchr-landing)

### 1. Desktop auth page: `src/app/auth/desktop/page.tsx`
```
- If not logged in → redirect to /login?redirect=/auth/desktop
- If logged in → show "Connect to Pinchr Desktop" with user info
- Click "Connect" → generates tokens → redirects to pinchr://auth/callback?access_token=...&refresh_token=...
```

### 2. API endpoint: `src/app/api/auth/me/route.ts`
```
GET /api/auth/me
Headers: Authorization: Bearer <access_token>
Response: { id, email, name, avatar_url, tier, trial_ends_at, stripe_customer_id }
```

Uses Supabase `getUser()` with the provided token.

## Renderer Side

### 1. useAuth hook: `src/renderer/src/hooks/useAuth.ts`
```typescript
export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  
  useEffect(() => {
    window.api.auth.getSession().then(session => {
      setUser(session?.user || null)
      setLoading(false)
    })
    
    // Listen for sign-in from protocol handler
    window.api.auth.onSignedIn((user) => setUser(user))
  }, [])
  
  const signIn = () => window.api.auth.signIn()
  const signOut = async () => {
    await window.api.auth.signOut()
    setUser(null)
  }
  
  return { user, loading, signIn, signOut, isSignedIn: !!user }
}
```

### 2. Update useLicense to use real account
Replace localStorage trial tracking with real account data:
- If signed in → use server-side tier + trial_ends_at
- If not signed in → keep 7-day local trial (anonymous users)
- If signed in + opted into newsletter → 37-day trial

### 3. Sign-in UI touchpoints
- **Onboarding**: "Sign in to Pinchr" step (optional, can skip)
- **Settings page**: Account section with sign in/out
- **Paywall**: "Sign in" button alongside "Upgrade"
- **Trial banner**: "Sign in for 30 extra days"

## Preload additions
```typescript
// src/preload/index.ts
auth: {
  signIn: () => ipcRenderer.invoke('auth:sign-in'),
  signOut: () => ipcRenderer.invoke('auth:sign-out'),
  getSession: () => ipcRenderer.invoke('auth:get-session'),
  onSignedIn: (cb) => ipcRenderer.on('auth:signed-in', (_, data) => cb(data)),
}
```

## electron-builder.yml
Add protocol registration:
```yaml
protocols:
  - name: Pinchr
    schemes:
      - pinchr
```

## Security
- Tokens stored via `safeStorage` (OS keychain encryption)
- Access tokens expire (Supabase default: 1 hour) — use refresh token
- Refresh token stored encrypted, never exposed to renderer
- HTTPS only for all API calls
- Protocol handler validates URL origin

## Files to create/modify
- `src/main/index.ts` — protocol registration + handler
- `src/main/auth.ts` — NEW: token storage, refresh, profile fetch
- `src/main/ipc.ts` — auth IPC handlers
- `src/preload/index.ts` — auth API bridge
- `src/shared/types.ts` — User type
- `src/renderer/src/hooks/useAuth.ts` — NEW
- `src/renderer/src/hooks/useLicense.ts` — integrate real account
- `electron-builder.yml` — protocol schemes
- (pinchr-landing) `src/app/auth/desktop/page.tsx` — NEW
- (pinchr-landing) `src/app/api/auth/me/route.ts` — NEW

## Test plan
1. Click "Sign in" → opens browser to pinchr.app/auth/desktop
2. Log in with Google → redirects to pinchr://auth/callback
3. App receives token, shows user name + avatar
4. Close and reopen app → still signed in
5. Sign out → tokens cleared, back to anonymous
6. Verify tier enforcement (trial vs basic vs pro)

## Constraints
- Sign-in is OPTIONAL — anonymous users get 7-day local trial
- Don't break existing onboarding flow
- Keep the existing license key path as fallback
- Must work in both dev (`yarn dev`) and production (built .app)
