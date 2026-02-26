# Pinchr Skill Marketplace Strategy

## The Opportunity

OpenClaw skills are powerful but require manual installation (CLI, config editing, dependency management). Most users will never run `clawhub install finance-toolkit`. But they would absolutely tap "Install" on a beautiful card in their app.

**Pinchr becomes the App Store for AI agent capabilities.**

## How It Works Today (ClawHub)

ClawHub (clawhub.com) is the existing skill registry for OpenClaw:
- Skills are directories with SKILL.md + scripts + config
- `clawhub search`, `clawhub install`, `clawhub update` via CLI
- Skills install to `~/.openclaw/skills/` or workspace `skills/`
- Any OpenClaw user can publish skills
- It works, but it's developer-facing

## The Pinchr Marketplace Layer

### User Experience

1. User opens Marketplace tab in Pinchr (or agent suggests a skill)
2. Browse categories: Productivity, Communication, Finance, Development, Marketing, Home, Health
3. Each skill shows: name, description, rating, install count, author, preview screenshots
4. One tap → skill installs to their OpenClaw workspace
5. If the skill has Pinchr components → UI cards become available immediately
6. Agent auto-discovers new capabilities and can start using them

### Architecture

```
┌─────────────┐    browse/search    ┌─────────────┐    install     ┌─────────────┐
│  Pinchr     │ ←─────────────────→ │  ClawHub    │ ──────────→   │  OpenClaw   │
│  Marketplace│                     │  API        │               │  Workspace  │
│  (UI)       │                     │  (registry) │               │  (skills/)  │
└─────────────┘                     └─────────────┘               └─────────────┘
       ↓
  If skill has Pinchr components:
  Load into json-render catalog
```

Pinchr doesn't host skills — it's a client for ClawHub. The registry, versioning, and distribution stay on ClawHub. Pinchr adds the beautiful browsing experience and one-click install.

### Skill Package Format (Extended)

Current ClawHub skill:
```
my-skill/
├── SKILL.md           # OpenClaw skill definition
├── scripts/           # Automation scripts
├── package.json       # Dependencies
└── README.md
```

Enhanced for Pinchr:
```
my-skill/
├── SKILL.md           # OpenClaw skill definition
├── scripts/           # Automation scripts
├── package.json       # Dependencies
├── README.md
├── pinchr/            # NEW: Pinchr UI layer
│   ├── catalog.json   # Component definitions (schemas)
│   ├── components/    # React component implementations
│   ├── preview.png    # Marketplace screenshot
│   └── manifest.json  # Pinchr metadata (category, tags, requirements)
└── clawhub.json       # Registry metadata (existing)
```

The `pinchr/` directory is optional. Skills without it still work in OpenClaw — they just don't get custom Pinchr cards. This maintains backward compatibility and the thin wrapper principle.

## First-Party Skills (Our App Store Advantage)

We build the best skills for the most common use cases. These are the "iMessage, Safari, Maps" of Pinchr — polished first-party experiences that set the quality bar.

### Priority 1: Core Productivity (Ship with v1)

#### 📧 Email Manager (`@pinchr/email`)
- **OpenClaw**: gog skill (Gmail), plus new IMAP/Exchange support
- **Pinchr cards**: EmailCard, InboxSummary, DraftReview
- **Agent behavior**: Continuous inbox monitoring, smart triage, draft replies, auto-categorize
- **Why first**: Everyone has email. This is the "wow, my agent actually does things" moment.

#### 📅 Calendar Assistant (`@pinchr/calendar`)
- **OpenClaw**: gog skill (Google Calendar), plus new Outlook/iCal support
- **Pinchr cards**: EventCard, ScheduleView, ConflictResolver, MeetingPrep
- **Agent behavior**: Schedule management, conflict detection, meeting prep notes, smart scheduling
- **Why first**: Calendar + email = the two things everyone checks first every day.

#### ✅ Task Manager (`@pinchr/tasks`)
- **OpenClaw**: things-mac, apple-reminders, or built-in task system
- **Pinchr cards**: TaskCard, TaskBoard, ProjectProgress
- **Agent behavior**: Task creation from conversation, priority management, deadline tracking
- **Why first**: Natural extension of conversation — "remind me to..." instantly becomes a tracked task.

#### 💬 Unified Messaging (`@pinchr/messages`)
- **OpenClaw**: imsg, slack, signal, telegram, whatsapp skills
- **Pinchr cards**: MessageCard, ChannelSummary, ThreadView
- **Agent behavior**: Cross-channel triage, smart replies, thread summaries
- **Why first**: This is OpenClaw's superpower — multi-channel already works. We just need the beautiful UI.

### Priority 2: Power Features (Month 2-3)

#### 📄 Document Studio (`@pinchr/docs`)
- **Pinchr cards**: DocumentPreview, DocumentEditor (inline), TemplateCard
- Draft, review, and edit documents through conversation
- Templates for common formats (meeting notes, proposals, reports)

#### 📊 Data & Analytics (`@pinchr/analytics`)
- **Pinchr cards**: DataCard, ChartView, InsightCard, MetricRow
- Natural language data queries
- Connect to spreadsheets, databases, APIs

#### 💰 Finance Tracker (`@pinchr/finance`)
- **Pinchr cards**: TransactionCard, BudgetView, InvoiceCard, ExpenseReport
- Connect to QuickBooks, Stripe, bank feeds
- Expense categorization, budget tracking, invoice management

#### 🔧 Developer Tools (`@pinchr/dev`)
- **Pinchr cards**: CodeReview, PRCard, CIStatus, IssueCard
- GitHub/GitLab integration
- Code review, PR management, CI monitoring

### Priority 3: Ecosystem Growth (Month 4+)

#### 🏠 Home Management (`@pinchr/home`)
- Smart home control, grocery lists, household coordination
- Hue lights, thermostats, security cameras

#### 🏃 Health & Fitness (`@pinchr/health`)
- Apple Health/Fitbit integration
- Workout tracking, habit streaks, health insights

#### 📱 Social Media (`@pinchr/social`)
- Content calendar, post drafting, analytics
- X/Twitter, LinkedIn, Instagram scheduling

#### 🎓 Learning (`@pinchr/learn`)
- Study plans, spaced repetition, summarize content
- YouTube/podcast transcription and notes

## Marketplace Mechanics

### Discovery
- **Featured skills** curated by us (quality control)
- **Categories** for browsing
- **Search** by keyword, use case, integration
- **Agent suggestions** — "I noticed you use Slack a lot. The Unified Messaging skill could help me manage your channels."

### Quality Control
- **Verified publisher** badge for trusted developers
- **Pinchr Certified** badge for skills that meet our UI/UX standards
- **Automated testing** — skills must pass basic functionality tests
- **User ratings and reviews**
- **Security scanning** — no malicious scripts, no data exfiltration

### Revenue Model
- **Free skills** — most first-party and community skills
- **Premium skills** — advanced capabilities, Pro plan required
- **Revenue share** — if third-party developers charge, we take a cut (Apple model: 70/30 → 85/15)
- **Subscription skills** — skills that require external API access could have their own billing
- **Enterprise custom skills** — built for specific org needs

### Developer Experience
- `clawhub create --pinchr` scaffold a new skill with Pinchr component template
- Local development: hot-reload components in Pinchr dev mode
- Testing: automated skill validation before publish
- Documentation: guides for building skills with Pinchr components
- Community: Discord #skill-builders channel

## Technical Implementation in Pinchr

### Marketplace Page
```
src/renderer/src/pages/Marketplace.tsx
src/renderer/src/components/marketplace/
  SkillCard.tsx          # Grid item in browse view
  SkillDetail.tsx        # Full page detail view
  CategoryFilter.tsx     # Category browser
  InstallButton.tsx      # One-click install with progress
  SkillReview.tsx        # Rating + review display
```

### Skill Management
```typescript
// src/renderer/src/hooks/useSkillMarketplace.ts
interface MarketplaceState {
  featured: Skill[]
  categories: Category[]
  installed: InstalledSkill[]
  
  search: (query: string) => Promise<Skill[]>
  install: (skillId: string) => Promise<void>
  uninstall: (skillId: string) => Promise<void>
  update: (skillId: string) => Promise<void>
  rate: (skillId: string, rating: number, review?: string) => Promise<void>
}
```

### Install Flow
1. User taps "Install" on a skill
2. Pinchr calls ClawHub API to fetch skill package
3. Skill extracted to OpenClaw workspace `skills/` directory
4. If `pinchr/` directory exists: load components into json-render catalog
5. Agent system prompt updated with new skill descriptions
6. Confirmation: "✅ Email Manager installed. I can now help manage your inbox."

### Component Hot-Loading
- Skills with `pinchr/catalog.json` define component schemas
- `pinchr/components/` contains React implementations
- Pinchr loads these dynamically at runtime (React.lazy + dynamic import)
- Components are sandboxed — they can only use approved design system primitives
- Version pinning: component versions tied to Pinchr app version for compatibility

## Implementation Phases

### Phase 1: Basic Marketplace (with Command Center v1)
- [ ] Marketplace page in Pinchr sidebar
- [ ] Browse ClawHub skills (read-only API)
- [ ] One-click install (calls `clawhub install` under the hood)
- [ ] Installed skills list with update/uninstall
- [ ] First-party skills: email, calendar, tasks, messages (OpenClaw-side only, no custom Pinchr cards yet)

### Phase 2: Pinchr Components
- [ ] json-render integration in Command Center
- [ ] First-party skills ship with Pinchr cards
- [ ] Component hot-loading from skill packages
- [ ] Skill component preview in marketplace

### Phase 3: Ecosystem
- [ ] Developer tools (`clawhub create --pinchr`)
- [ ] Automated testing + security scanning
- [ ] User ratings and reviews
- [ ] Revenue share infrastructure (Stripe Connect)
- [ ] Agent-generated components publishable to ClawHub

---

*This is the App Store play. The marketplace is where ecosystem value compounds and switching cost builds. Every skill installed makes Pinchr more valuable.*

*References: VISION.md, card-framework.md*
*Last updated: 2026-02-14*
