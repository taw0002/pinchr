/**
 * License module — Pinchr is free and open source (MIT).
 * These stubs exist to satisfy IPC handlers during the transition.
 */

export function getLicenseStatus() {
  return {
    valid: true,
    plan: 'free' as const,
    expiresAt: undefined,
    trialEndsAt: undefined,
    isTrialActive: false,
  }
}

export function activateLicense(_key: string) {
  return { success: true, error: undefined }
}

export function deactivateLicense() {
  return { success: true, error: undefined }
}

export function ensureInstalledAt() {
  // no-op — no trial tracking needed
}
