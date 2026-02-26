# Pinchr — Product Strategy

## The Analogy

**Cursor is to VS Code what Pinchr is to OpenClaw.**

Cursor didn't reinvent the editor — they took something great and made AI the primary interface. We're doing the same for personal AI assistants.

OpenClaw = powerful open-source AI assistant engine (CLI, config files, YAML)
Pinchr = the AI-native desktop experience that makes it feel like magic

## Core Value Proposition

**"Your AI assistant, everywhere — without the setup."**

Today, using OpenClaw means:
- Installing via npm
- Editing YAML config files
- Running terminal commands
- Manually wiring up channels (Slack bots, WhatsApp bridges, etc.)
- Granting macOS permissions by hunting for binaries in System Settings

Pinchr removes ALL of that. You download an app, and your AI assistant just works.

## Why This Is a Business

Cursor proved the model: take an open-source tool, wrap it in a beautiful AI-native UX, charge $20/mo. They hit $100M+ ARR.

Our advantages:
- OpenClaw is MIT licensed — we can build freely on top
- The market for personal AI assistants is exploding
- Nobody has built the "one app" for omnichannel AI yet
- ChatGPT/Claude desktop apps are single-channel — we're the unified layer

## The Experience

### What It Feels Like
- Open Pinchr → your assistant greets you
- Messages from Slack, WhatsApp, Gmail, iMessage flow into one timeline
- You talk to your AI naturally — it handles the rest
- It sees your screen, manages your calendar, sends messages on your behalf
- Background automations run 24/7 — you just set them up by asking
- No config files. No terminal. No API keys (we provide the AI or you bring your own).

### Design Principles
1. **AI is the interface** — not a feature, not a sidebar. The AI IS the app.
2. **Zero to value in 60 seconds** — download → open → talking to your AI
3. **Progressive disclosure** — simple by default, powerful when you need it
4. **It should feel alive** — real-time messages, streaming responses, ambient awareness
5. **Remove complexity, don't add it** — every screen should have less than you expect

## User Journey

### 1. Landing Page (pinchr.app)
- Hero: Show the actual app with messages flowing in from multiple channels
- Value prop: "Your AI, everywhere. One app for Slack, WhatsApp, Gmail, and more."
- Social proof, pricing, download button
- **Goal: Download the app**

### 2. First Launch (< 60 seconds to first conversation)
- App detects system state (OpenClaw installed? Gateway running?)
- If nothing installed → Pinchr handles it silently (bundles OpenClaw or installs it)
- Permissions → Native macOS prompts (not "go to System Settings")
- AI → Either use Pinchr's bundled AI (Pro) or paste one API key
- **Goal: User is talking to their AI within a minute**

### 3. Onboarding (progressive, not blocking)
- First screen: "Hi, I'm your AI assistant. What should I call you?"
- The AI itself guides setup through conversation, not forms
- "Want me to connect to your Slack?" → OAuth popup → done
- "I can read your screen to help more — want to enable that?" → permission prompt
- Each connection unlocks visible new capabilities
- **Goal: User feels the AI getting smarter with each step**

### 4. Daily Use
- Omnichannel timeline — all messages, all channels, one view
- Chat with your AI — it knows your context across everything
- ⌘K command palette for power users
- Background tasks running (email checks, calendar reminders, monitoring)
- System tray — always there, never in the way
- **Goal: Pinchr becomes the first app they open**

## Pricing

| Tier | Price | What You Get |
|------|-------|-------------|
| Free | $0 | Bring your own AI key, 1 channel, basic features |
| Pro | $19/mo | Pinchr AI (no key needed), unlimited channels, automations, screen control |
| Team | $49/mo | Shared assistants, team channels, admin controls |

## Competitive Landscape

| Product | Channels | Screen Control | Automations | AI-Native |
|---------|----------|---------------|-------------|-----------|
| ChatGPT Desktop | Just ChatGPT | No | No | Partial |
| Claude Desktop | Just Claude | Limited (MCP) | No | Partial |
| Cursor | Just code editor | No | No | Yes ✅ |
| **Pinchr** | **All of them** | **Yes** | **Yes** | **Yes ✅** |

## Phase 1 (Ship It)
- [ ] Onboarding that actually works (permissions, AI, first conversation)
- [ ] Chat with OpenClaw gateway (streaming)
- [ ] At least 2 channels working (Slack + one more)
- [ ] Screen capture + basic automation
- [ ] System tray + notifications
- [ ] Landing page with download
- [ ] Mac-only, direct download from pinchr.app

## Phase 2 (Grow)
- [ ] Pinchr AI (bundled, no API key needed)
- [ ] OAuth for all channel connections
- [ ] Visual automation builder
- [ ] Auto-updater
- [ ] Usage dashboard + cost tracking
- [ ] Code signing + notarization

## Phase 3 (Scale)
- [ ] Team features
- [ ] Windows + Linux
- [ ] iOS companion app
- [ ] Plugin/skill marketplace
- [ ] Enterprise features

---

*"The best AI assistant is the one you actually use every day."*
