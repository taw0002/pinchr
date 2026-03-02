# Building & Deploying Pinchr

## Prerequisites

- **Node v20** (v22+ does NOT have yarn — use nvm to switch)
- **yarn** package manager
- **Python 3 + setuptools** (for native module compilation: `pip3 install setuptools`)
- **Apple Developer ID Application cert** in Keychain (for signing)
- **AWS CLI** configured (for S3 upload)

## Quick Reference

```bash
# Switch to Node 20
nvm use 20

# Build + sign + notarize + upload (one command)
yarn release

# Or step by step:
yarn dist                    # Build, sign, notarize
yarn release:upload          # Upload to S3
```

## Environment Variables (Required for Signing + Notarization)

```bash
export APPLE_ID="dwagner@launchpad.bot"
export APPLE_ID_PASS="<app-specific-password>"  # From account.apple.com → App-Specific Passwords
```

Without these, the build will still sign (cert is in Keychain) but **skip notarization**.
An un-notarized DMG will trigger macOS Gatekeeper: "Apple could not verify this app".

## Build Commands

| Command | What it does |
|---------|-------------|
| `yarn dist` | electron-vite build + electron-builder (sign + notarize) |
| `yarn release` | Full pipeline: build → sign → notarize → upload to S3 |
| `yarn release:upload` | Upload dist/*.dmg and *.zip to S3 (skip build) |

## Step-by-Step Manual Build

```bash
# 1. Switch to Node 20
nvm use 20

# 2. Install dependencies (if needed)
yarn install --ignore-engines

# 3. Build + sign + notarize
APPLE_ID="dwagner@launchpad.bot" APPLE_ID_PASS="<password>" yarn dist

# 4. Verify signing
codesign --verify --deep --strict dist/mac-arm64/Pinchr.app

# 5. Verify notarization
/usr/sbin/spctl --assess --type exec --verbose dist/mac-arm64/Pinchr.app
# Should say: "accepted, source=Notarized Developer ID"

# 6. Upload to S3
yarn release:upload
```

## S3 Release Structure

Bucket: `pinchr-releases` (us-east-1, public read)

```
pinchr-releases/
├── v0.1.0-alpha/          # Legacy URL (pinchr.app download page points here)
│   ├── Pinchr-0.1.0-arm64.dmg
│   └── Pinchr-0.1.0-arm64-mac.zip
├── v0.1.2/                # Versioned releases
│   ├── Pinchr-0.1.2-arm64.dmg
│   └── Pinchr-0.1.2-arm64-mac.zip
└── latest.yml             # For electron-updater auto-update
```

The `v0.1.0-alpha/` path is what pinchr.app/download links to. Always upload the latest build there too.

## Code Signing Details

- **Identity**: `Developer ID Application: LaunchPad, LLC (8RZNRHSN39)`
- **Cert SHA**: `1B77C6005462FCE3E8658A423C1A768443EC4583`
- **Team ID**: `8RZNRHSN39`
- **Entitlements**: `build/entitlements.mac.plist`
- **Notarization**: `build/notarize.js` (runs as afterSign hook)

## Common Issues

### "Apple could not verify Pinchr"
The DMG wasn't notarized. Rebuild with `APPLE_ID` and `APPLE_ID_PASS` set.
Quick fix for users: `xattr -cr /Applications/Pinchr.app`

### node-gyp fails (node-pty)
Python 3.12+ removed `distutils`. Fix: `pip3 install setuptools`

### "No module named 'distutils'"
Same fix: `pip3 install --break-system-packages setuptools`

### Notarization hangs
Apple's servers can be slow (1-5 minutes). If it hangs > 10 minutes, kill and retry.
You can also notarize separately:
```bash
APPLE_ID="..." APPLE_ID_PASS="..." node build/notarize-standalone.js
```

### Wrong Node version
yarn only exists on Node 20. If you see "yarn: command not found", run `nvm use 20`.

## ⚠️ NEVER use `yarn dev` for testing

`yarn dev` launches as "Electron" without proper bundle ID → macOS permissions break.
Always use `yarn dist` + `open dist/mac-arm64/Pinchr.app`.
