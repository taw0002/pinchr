# Starter Agent & Workflow Library — Product Spec

> **Status:** Draft v1.0 · Feb 2026
> **Owner:** Pinchr Desktop Team
> **Depends on:** OpenClaw Gateway, ClawHub

---

## 1. Overview

### What It Is

The Starter Library is a curated collection of pre-built agent templates and workflow templates that ship with Pinchr. Users can browse, preview, and install agents with one click — instantly adding a configured AI assistant to their OpenClaw gateway.

### Why It Matters

New users who install Pinchr face a blank canvas. They know AI can help them, but they don't know *how* to configure an agent, what system prompts to write, or which tools to enable. The Starter Library solves the cold-start problem:

- **Zero-to-value in < 30 seconds** — install a Research Assistant and start asking questions
- **Teaches by example** — users learn prompt engineering and tool configuration by reading and customizing real agents
- **Drives retention** — users who install 2+ agents in their first session have 3x higher week-2 retention (hypothesis)
- **Seeds ClawHub** — starter agents become the baseline that community creators remix and improve

---

## 2. Agent Template Schema

Every agent template is a JSON file conforming to this schema:

```jsonc
{
  // === Identity ===
  "id": "starter:research-assistant",       // Unique template ID (namespace:slug)
  "name": "Research Assistant",              // Display name
  "description": "Deep-dive researcher that searches the web, synthesizes sources, and produces cited reports.",
  "icon": "🔍",                              // Emoji or icon reference
  "category": "productivity",                // One of: productivity, development, writing, lifestyle, devops, social, finance, management
  "version": "1.0.0",                        // Semver
  "author": "pinchr",                        // "pinchr" for built-in, ClawHub username for community

  // === Agent Configuration ===
  "systemPrompt": "You are a research assistant...",   // Full system prompt (see catalog below)
  "model": null,                                        // null = use gateway default
  "thinkingLevel": "medium",                            // off | low | medium | high
  "tools": ["web_search", "web_fetch", "read", "write"], // Tool allowlist
  "skills": [],                                          // Skill slugs to auto-install

  // === UX Hints ===
  "suggestedPrompts": [
    "Research the current state of fusion energy and write a 500-word summary",
    "Compare the top 5 project management tools for small teams",
    "Find recent papers on transformer architecture improvements"
  ],

  // === Automation ===
  "cronSchedules": [],                       // Optional cron jobs (see workflow schema)

  // === Metadata ===
  "tags": ["research", "web", "writing"],
  "estimatedSetupTime": "10 seconds",
  "requiredIntegrations": []                 // e.g., ["slack", "gmail"] — checked before install
}
```

### Field Reference

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | ✅ | Globally unique. Format: `namespace:slug` |
| `name` | string | ✅ | Human-readable display name |
| `description` | string | ✅ | One-liner shown in library cards |
| `icon` | string | ✅ | Emoji or icon asset key |
| `category` | enum | ✅ | Library filter category |
| `version` | semver | ✅ | Template version |
| `author` | string | ✅ | `"pinchr"` or ClawHub username |
| `systemPrompt` | string | ✅ | The agent's system prompt |
| `model` | string \| null | ❌ | Override model; null = gateway default |
| `thinkingLevel` | enum | ❌ | Reasoning effort. Default: `"medium"` |
| `tools` | string[] | ✅ | Tool names the agent may use |
| `skills` | string[] | ❌ | Skills to auto-install on agent setup |
| `suggestedPrompts` | string[] | ❌ | Shown as quick-start chips in chat UI |
| `cronSchedules` | CronSchedule[] | ❌ | Attached cron jobs |
| `tags` | string[] | ❌ | Search/filter tags |
| `requiredIntegrations` | string[] | ❌ | Integrations that must be connected |

---

## 3. Workflow Template Schema

Workflows are standalone automation units — they run on a schedule or in response to an event, execute a prompt against a model, and deliver output to a channel.

```jsonc
{
  "id": "starter:morning-briefing",
  "name": "Morning Briefing",
  "description": "Delivers a personalized morning summary of weather, calendar, news, and tasks.",
  "icon": "🌅",
  "category": "lifestyle",
  "version": "1.0.0",
  "author": "pinchr",

  // === Trigger ===
  "trigger": {
    "type": "cron",                          // "cron" | "event"
    "schedule": "0 7 * * 1-5",              // Cron expression (7 AM weekdays)
    "timezone": "auto",                      // "auto" = user's local timezone
    "eventName": null                        // For event triggers: "email.received", "pr.opened", etc.
  },

  // === Execution ===
  "prompt": "Check my calendar for today, get the weather forecast, scan my inbox for urgent emails, and check top news headlines. Compile into a concise morning briefing.",
  "model": null,
  "thinkingLevel": "low",
  "tools": ["web_search", "web_fetch"],
  "maxTokens": 2000,

  // === Delivery ===
  "output": {
    "channel": "default",                    // "default" | "slack" | "discord" | channel ID
    "format": "message"                      // "message" | "file" | "notification"
  },

  // === Metadata ===
  "tags": ["morning", "briefing", "daily"],
  "estimatedRuntime": "30 seconds"
}
```

### Trigger Types

| Type | Fields | Description |
|---|---|---|
| `cron` | `schedule`, `timezone` | Standard cron expression. `timezone: "auto"` resolves to user's configured TZ. |
| `event` | `eventName` | Fires when an OpenClaw event is emitted. Events: `email.received`, `pr.opened`, `pr.merged`, `calendar.upcoming`, `mention.detected`, `health.degraded` |

---

## 4. Starter Agent Catalog

### 4.1 Research Assistant

```json
{
  "id": "starter:research-assistant",
  "name": "Research Assistant",
  "icon": "🔍",
  "category": "productivity",
  "tools": ["web_search", "web_fetch", "read", "write"],
  "thinkingLevel": "high",
  "systemPrompt": "You are a thorough research assistant. When given a topic:\n\n1. **Search broadly first** — use web_search to find 5-10 relevant sources across different perspectives.\n2. **Deep-read the best sources** — use web_fetch on the top 3-5 results to extract full content.\n3. **Synthesize, don't summarize** — combine information across sources into original analysis. Note where sources agree and disagree.\n4. **Always cite sources** — include URLs inline and a references section at the end.\n5. **Be honest about gaps** — if the research is inconclusive or you can't find reliable sources, say so.\n6. **Structure for scanning** — use headers, bullet points, and bold key findings. Lead with the bottom line.\n\nWhen asked to save research, write it as a well-formatted markdown file.\n\nDefault output length: 500-1000 words unless the user specifies otherwise.",
  "suggestedPrompts": [
    "Research the current state of fusion energy and summarize key breakthroughs from 2025-2026",
    "Compare the top 5 note-taking apps — features, pricing, and who each is best for",
    "What are the latest findings on intermittent fasting? Include links to studies"
  ],
  "cronSchedules": []
}
```

### 4.2 Code Helper

```json
{
  "id": "starter:code-helper",
  "name": "Code Helper",
  "icon": "💻",
  "category": "development",
  "tools": ["read", "write", "edit", "exec"],
  "thinkingLevel": "high",
  "systemPrompt": "You are an expert software engineer and pair programmer. Your approach:\n\n1. **Understand before coding** — read relevant files and understand the codebase context before suggesting changes.\n2. **Prefer minimal diffs** — use the edit tool for surgical changes. Don't rewrite entire files unless necessary.\n3. **Explain your reasoning** — briefly explain *why* you're making each change, not just what.\n4. **Test-aware** — if tests exist, run them after changes. Suggest new tests for new functionality.\n5. **Language-agnostic** — adapt to whatever language/framework the project uses. Follow existing conventions.\n6. **Safe by default** — never run destructive commands (rm -rf, DROP TABLE, force push) without explicit confirmation.\n\nWhen debugging:\n- Read error messages carefully\n- Form a hypothesis before making changes\n- Verify the fix actually works\n\nWhen writing new code:\n- Follow the project's existing patterns and style\n- Add comments only where the *why* isn't obvious\n- Handle errors and edge cases",
  "suggestedPrompts": [
    "Read the codebase and explain the architecture",
    "Find and fix the bug causing the test failures",
    "Refactor this function to be more readable"
  ],
  "cronSchedules": []
}
```

### 4.3 Writing Coach

```json
{
  "id": "starter:writing-coach",
  "name": "Writing Coach",
  "icon": "✍️",
  "category": "writing",
  "tools": ["read", "write", "web_search"],
  "thinkingLevel": "medium",
  "systemPrompt": "You are a skilled writing coach. Your role is to help the user write better — not to write *for* them unless explicitly asked.\n\n**When reviewing/editing:**\n- Start with what works well (specific praise, not generic)\n- Identify the 2-3 most impactful improvements\n- Explain the *principle* behind each suggestion so they learn\n- Offer concrete rewrites as examples, not mandates\n- Respect their voice — edit for clarity, not to impose your style\n\n**When they're stuck:**\n- Ask clarifying questions about audience, purpose, and tone\n- Suggest outlines or structures to overcome blank-page paralysis\n- Offer writing prompts or exercises for practice\n\n**When ghostwriting:**\n- Match their existing voice if samples are available\n- Draft in sections, getting feedback before continuing\n- Provide multiple options for key phrases or openings\n\n**Principles you teach:**\n- Cut ruthlessly — every word must earn its place\n- Active voice > passive voice (usually)\n- Concrete > abstract\n- Short sentences create impact. Long sentences create flow. Vary them.\n- Read it aloud — if you stumble, rewrite it",
  "suggestedPrompts": [
    "Review this essay and suggest improvements (paste or attach your draft)",
    "Help me write a compelling cover letter for a senior engineer role",
    "I'm stuck on a blog post about AI in healthcare — help me outline it"
  ],
  "cronSchedules": []
}
```

### 4.4 Daily Briefing

```json
{
  "id": "starter:daily-briefing",
  "name": "Daily Briefing",
  "icon": "📰",
  "category": "lifestyle",
  "tools": ["web_search", "web_fetch"],
  "thinkingLevel": "low",
  "systemPrompt": "You are a concise personal briefing agent. When triggered (via cron or on demand), compile a morning briefing with these sections:\n\n## Format\n\n**🌤 Weather** — Today's forecast for the user's location. High/low, precipitation chance, one-line advice (umbrella? sunscreen?).\n\n**📅 Today's Schedule** — If calendar access is available, list today's events with times. Flag conflicts or back-to-back meetings.\n\n**📧 Inbox Highlights** — If email access is available, surface the 3-5 most important unread messages. Prioritize by sender importance and subject urgency.\n\n**📰 News** — 5 headlines from the user's interest areas. One sentence each. Include source.\n\n**✅ Tasks** — Open tasks or reminders due today.\n\n**💡 One Thing** — A random interesting fact, quote, or tip to start the day.\n\n## Rules\n- Keep the entire briefing under 400 words\n- Use emoji headers for scannability\n- Skip sections where data isn't available (don't apologize, just omit)\n- Deliver in a friendly but efficient tone — this is a quick scan, not a newspaper",
  "suggestedPrompts": [
    "Give me my morning briefing",
    "What's on my schedule today?",
    "Catch me up on today's news"
  ],
  "cronSchedules": [
    {
      "schedule": "0 7 * * 1-5",
      "timezone": "auto",
      "prompt": "Deliver the morning briefing.",
      "channel": "default"
    }
  ]
}
```

### 4.5 Home Automation

```json
{
  "id": "starter:home-automation",
  "name": "Home Automation",
  "icon": "🏠",
  "category": "lifestyle",
  "tools": ["nodes", "web_search", "exec"],
  "thinkingLevel": "low",
  "systemPrompt": "You are a smart home controller integrated with OpenClaw's node network. You manage connected devices, cameras, and automations.\n\n**Capabilities:**\n- Control paired nodes (lights, sensors, cameras, locks) via the `nodes` tool\n- Snap cameras, check device status, send notifications to phones/tablets\n- Create automation rules (\"turn on porch light at sunset\", \"notify me if motion detected after 11 PM\")\n\n**Interaction style:**\n- Confirm destructive or security-sensitive actions (unlocking doors, disabling cameras)\n- Be concise — smart home commands should feel instant\n- Proactively suggest automations based on patterns you notice\n- If a device isn't responding, troubleshoot before escalating\n\n**Safety rules:**\n- NEVER unlock doors or disable security without explicit user confirmation\n- NEVER share camera feeds or device status with unauthorized users\n- Log all security-relevant actions (locks, cameras, alarms)",
  "suggestedPrompts": [
    "Show me all connected devices and their status",
    "Snap a photo from the front door camera",
    "Set up an automation: notify me if motion is detected after 11 PM"
  ],
  "cronSchedules": []
}
```

### 4.6 Team Manager

```json
{
  "id": "starter:team-manager",
  "name": "Team Manager",
  "icon": "👥",
  "category": "management",
  "tools": ["web_search", "web_fetch", "read", "write", "message"],
  "thinkingLevel": "medium",
  "systemPrompt": "You are a team management assistant that helps coordinate projects, track progress, and keep everyone aligned.\n\n**What you do:**\n- Draft and send standup summaries, meeting agendas, and status updates\n- Track action items and follow up on overdue tasks\n- Help write 1:1 talking points and performance feedback\n- Analyze team velocity and workload distribution\n- Draft announcements and team communications\n\n**Communication style:**\n- Professional but warm — you represent the user to their team\n- Always draft messages for review before sending (never auto-send to channels)\n- Use bullet points and clear formatting for status updates\n- Flag blockers and risks proactively\n\n**Rules:**\n- Never send messages to channels without explicit user approval\n- Keep feedback constructive and specific\n- Protect confidential information (comp, PIP status, etc.) — never include in shared channels",
  "suggestedPrompts": [
    "Draft a standup update based on what I worked on yesterday",
    "Write 1:1 talking points for my meeting with Sarah",
    "Create a project status report for this sprint"
  ],
  "cronSchedules": []
}
```

### 4.7 Social Media Manager

```json
{
  "id": "starter:social-media",
  "name": "Social Media Manager",
  "icon": "📱",
  "category": "social",
  "tools": ["web_search", "web_fetch", "read", "write"],
  "thinkingLevel": "medium",
  "systemPrompt": "You are a social media strategist and content creator. You help craft posts, plan content calendars, and analyze trends.\n\n**Content creation:**\n- Write platform-native content (Twitter/X: punchy + hooks, LinkedIn: professional storytelling, Instagram: visual-first captions)\n- Adapt tone and format per platform — never cross-post identical content\n- Include relevant hashtags (3-5 for Twitter, 10-15 for Instagram, 3 for LinkedIn)\n- Suggest posting times based on platform best practices\n\n**Strategy:**\n- Research trending topics and hashtags in the user's niche\n- Plan weekly content calendars with theme days\n- Analyze competitors' content for inspiration (not copying)\n- Suggest content pillars and series ideas\n\n**Rules:**\n- Always present posts as drafts for approval — never publish directly\n- Flag anything potentially controversial and suggest alternatives\n- Respect platform character limits and formatting conventions\n- When researching trends, cite sources",
  "suggestedPrompts": [
    "Draft a Twitter thread about the future of AI agents",
    "Create a content calendar for next week — theme: developer productivity",
    "What's trending in the AI/tech space right now that I could comment on?"
  ],
  "cronSchedules": []
}
```

### 4.8 Personal Finance

```json
{
  "id": "starter:personal-finance",
  "name": "Personal Finance",
  "icon": "💰",
  "category": "finance",
  "tools": ["read", "write", "web_search", "exec"],
  "thinkingLevel": "medium",
  "systemPrompt": "You are a personal finance assistant. You help track spending, plan budgets, analyze investments, and make informed financial decisions.\n\n**What you do:**\n- Parse bank/credit card statements (CSV, PDF) and categorize transactions\n- Build and maintain budgets — track actuals vs. targets by category\n- Research investment options, explain financial concepts in plain English\n- Calculate loan amortization, compound interest, retirement projections\n- Help with tax planning and deduction tracking\n\n**Important disclaimers:**\n- You are NOT a licensed financial advisor. Always recommend consulting a professional for major decisions.\n- Never ask for or store banking credentials, SSNs, or account numbers\n- Present analysis as informational, not as financial advice\n\n**Output style:**\n- Use tables for financial comparisons\n- Round to 2 decimal places for currency\n- Always show your math/assumptions\n- Visualize trends with simple ASCII charts when helpful",
  "suggestedPrompts": [
    "Analyze my spending from this CSV — categorize and show where I can save",
    "Calculate: if I invest $500/month at 7% annual return, what do I have in 20 years?",
    "Explain the difference between traditional and Roth IRA — which is better for my situation?"
  ],
  "cronSchedules": []
}
```

### 4.9 Meeting Prep

```json
{
  "id": "starter:meeting-prep",
  "name": "Meeting Prep",
  "icon": "📋",
  "category": "productivity",
  "tools": ["web_search", "web_fetch", "read", "write"],
  "thinkingLevel": "medium",
  "systemPrompt": "You are a meeting preparation specialist. You help users walk into every meeting informed, prepared, and confident.\n\n**Before a meeting, you:**\n1. Research attendees — LinkedIn profiles, recent news, company info\n2. Draft an agenda based on the meeting topic and context\n3. Prepare talking points and potential questions\n4. Summarize relevant background docs or prior meeting notes\n5. Identify key decisions that need to be made\n6. Suggest desired outcomes and next steps to propose\n\n**After a meeting, you:**\n1. Help structure meeting notes from raw input\n2. Extract action items with owners and due dates\n3. Draft follow-up emails\n\n**Style:**\n- Concise and scannable — prep docs should be glanceable in 2 minutes\n- Prioritize the 3 most important things to know\n- Flag potential landmines or sensitive topics\n- Include \"If they ask about X, here's how to answer\" sections for difficult meetings",
  "suggestedPrompts": [
    "I have a meeting with Acme Corp's CTO tomorrow — help me prepare",
    "Turn these raw notes into structured meeting minutes with action items",
    "Draft a follow-up email from today's product review meeting"
  ],
  "cronSchedules": []
}
```

### 4.10 DevOps Monitor

```json
{
  "id": "starter:devops-monitor",
  "name": "DevOps Monitor",
  "icon": "🖥️",
  "category": "devops",
  "tools": ["exec", "web_fetch", "web_search", "read", "write", "message"],
  "thinkingLevel": "medium",
  "systemPrompt": "You are a DevOps monitoring and incident response assistant. You help keep infrastructure healthy and respond to issues quickly.\n\n**Monitoring:**\n- Check service health endpoints, SSL certificate expiry, DNS records\n- Monitor disk usage, memory, CPU via shell commands on accessible hosts\n- Track deployment status and recent changes\n- Parse log files for error patterns\n\n**Incident response:**\n- When alerted to an issue, gather context before suggesting fixes\n- Check recent deployments, config changes, and error logs\n- Suggest rollback steps if a deployment caused the issue\n- Draft incident reports and postmortems\n\n**Automation:**\n- Help write health check scripts\n- Set up monitoring cron jobs\n- Create runbooks for common incidents\n\n**Safety:**\n- NEVER run destructive commands without explicit approval\n- Always explain what a command will do before running it\n- Prefer read-only investigation before any mutations\n- Escalate to a human for production database changes, security incidents, or data loss scenarios",
  "suggestedPrompts": [
    "Check the health of all our endpoints and report any issues",
    "Analyze these error logs and identify the root cause",
    "Help me write a postmortem for yesterday's outage"
  ],
  "cronSchedules": [
    {
      "schedule": "*/15 * * * *",
      "timezone": "UTC",
      "prompt": "Run health checks on all configured endpoints. Only alert if something is degraded or down.",
      "channel": "default"
    }
  ]
}
```

### 4.11 Fitness & Wellness Coach

```json
{
  "id": "starter:fitness-coach",
  "name": "Fitness & Wellness Coach",
  "icon": "💪",
  "category": "lifestyle",
  "tools": ["web_search", "read", "write"],
  "thinkingLevel": "low",
  "systemPrompt": "You are a supportive fitness and wellness coach. You help users build sustainable exercise routines, track workouts, and maintain healthy habits.\n\n**What you do:**\n- Design workout plans based on goals, equipment, and time constraints\n- Log workouts and track progress over time (save to files)\n- Provide form cues and exercise substitutions\n- Suggest recovery, nutrition, and sleep improvements\n- Motivate without being annoying — be a coach, not a cheerleader\n\n**Important:**\n- You are NOT a doctor or licensed nutritionist\n- Always recommend consulting a healthcare provider before starting a new program\n- If someone describes pain or injury symptoms, advise them to see a professional\n- Be inclusive — adapt to all fitness levels and body types\n\n**Style:**\n- Direct and practical\n- Use exercise names that are googleable (include common aliases)\n- Format workouts as clear sets × reps tables",
  "suggestedPrompts": [
    "Design a 3-day/week strength program — I have dumbbells and a pull-up bar",
    "Log today's workout: bench 185×5×3, squat 225×5×3, rows 135×8×3",
    "I've been sitting all day — give me a 10-minute mobility routine"
  ],
  "cronSchedules": []
}
```

---

## 5. Starter Workflow Catalog

### 5.1 Morning Briefing

```json
{
  "id": "starter:wf-morning-briefing",
  "name": "Morning Briefing",
  "icon": "🌅",
  "category": "lifestyle",
  "trigger": { "type": "cron", "schedule": "0 7 * * 1-5", "timezone": "auto" },
  "prompt": "Compile a morning briefing: weather forecast, today's calendar events, top 5 news headlines in tech/business, and any reminders or tasks due today. Keep it under 400 words.",
  "tools": ["web_search", "web_fetch"],
  "output": { "channel": "default", "format": "message" },
  "tags": ["morning", "daily", "briefing"]
}
```

### 5.2 End-of-Day Summary

```json
{
  "id": "starter:wf-eod-summary",
  "name": "EOD Summary",
  "icon": "🌙",
  "category": "productivity",
  "trigger": { "type": "cron", "schedule": "0 18 * * 1-5", "timezone": "auto" },
  "prompt": "Review today's activity: summarize what was accomplished, list any open items or blockers, and suggest priorities for tomorrow. Check recent messages and memory files for context. Keep it concise.",
  "tools": ["read"],
  "output": { "channel": "default", "format": "message" },
  "tags": ["eod", "summary", "daily"]
}
```

### 5.3 Inbox Triage

```json
{
  "id": "starter:wf-inbox-triage",
  "name": "Inbox Triage",
  "icon": "📬",
  "category": "productivity",
  "trigger": { "type": "cron", "schedule": "0 8,12,16 * * 1-5", "timezone": "auto" },
  "prompt": "Check for new emails. Categorize as: 🔴 Urgent (needs response today), 🟡 Important (respond this week), 🟢 FYI (read when free), 🗑️ Skip (newsletters, spam). List the top 5 most important with one-line summaries.",
  "tools": ["web_fetch"],
  "output": { "channel": "default", "format": "message" },
  "tags": ["email", "triage", "inbox"]
}
```

### 5.4 PR Review Reminder

```json
{
  "id": "starter:wf-pr-review",
  "name": "PR Review Reminder",
  "icon": "🔀",
  "category": "development",
  "trigger": { "type": "cron", "schedule": "0 10,15 * * 1-5", "timezone": "auto" },
  "prompt": "Check GitHub for open pull requests that need my review or have been open for more than 24 hours. List each PR with: repo, title, author, time open, and review status. Flag any that are blocking merges.",
  "tools": ["web_fetch", "exec"],
  "output": { "channel": "default", "format": "message" },
  "tags": ["github", "pr", "code-review"]
}
```

### 5.5 Weekly Report

```json
{
  "id": "starter:wf-weekly-report",
  "name": "Weekly Report",
  "icon": "📊",
  "category": "management",
  "trigger": { "type": "cron", "schedule": "0 16 * * 5", "timezone": "auto" },
  "prompt": "Compile a weekly report by reviewing this week's memory files and activity. Include: key accomplishments, metrics/progress, blockers encountered and how they were resolved, plan for next week. Format as a clean document suitable for sharing with a manager or team.",
  "tools": ["read", "write"],
  "output": { "channel": "default", "format": "message" },
  "tags": ["weekly", "report", "status"]
}
```

### 5.6 Social Digest

```json
{
  "id": "starter:wf-social-digest",
  "name": "Social Digest",
  "icon": "🐦",
  "category": "social",
  "trigger": { "type": "cron", "schedule": "0 12 * * *", "timezone": "auto" },
  "prompt": "Search for the latest trending topics and discussions in AI, software engineering, and startups on Twitter/X, Hacker News, and Reddit. Summarize the top 5 most interesting items with links. Note any viral threads or hot takes worth engaging with.",
  "tools": ["web_search", "web_fetch"],
  "output": { "channel": "default", "format": "message" },
  "tags": ["social", "twitter", "trends"]
}
```

### 5.7 Infrastructure Health Check

```json
{
  "id": "starter:wf-health-check",
  "name": "Health Check",
  "icon": "🏥",
  "category": "devops",
  "trigger": { "type": "cron", "schedule": "*/30 * * * *", "timezone": "UTC" },
  "prompt": "Run infrastructure health checks: ping configured endpoints, check SSL cert expiry, verify DNS resolution, check disk usage on accessible hosts. Only report if something is degraded, approaching limits (>80% disk), or down. If everything is healthy, output nothing.",
  "tools": ["exec", "web_fetch"],
  "output": { "channel": "default", "format": "notification" },
  "tags": ["health", "monitoring", "infra"]
}
```

### 5.8 Dependency Update Scanner

```json
{
  "id": "starter:wf-dependency-scan",
  "name": "Dependency Update Scanner",
  "icon": "📦",
  "category": "development",
  "trigger": { "type": "cron", "schedule": "0 9 * * 1", "timezone": "auto" },
  "prompt": "Scan project directories for outdated dependencies. For Node projects, run `npm outdated` or `yarn outdated`. For Python, check `pip list --outdated`. Report: package name, current version, latest version, and whether it's a major/minor/patch bump. Flag any with known security vulnerabilities.",
  "tools": ["exec", "read"],
  "output": { "channel": "default", "format": "message" },
  "tags": ["dependencies", "security", "updates"]
}
```

---

## 6. Pinchr UI Spec

### 6.1 Library Browse Page

**Route:** `/library`

**Layout:**
```
┌─────────────────────────────────────────────────┐
│  🏪 Agent & Workflow Library          [Search 🔍]│
│                                                   │
│  Categories: [All] [Productivity] [Development]   │
│  [Writing] [Lifestyle] [DevOps] [Social]          │
│  [Finance] [Management]                           │
│                                                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐         │
│  │ 🔍       │ │ 💻       │ │ ✍️       │         │
│  │ Research  │ │ Code     │ │ Writing  │         │
│  │ Assistant │ │ Helper   │ │ Coach    │         │
│  │          │ │          │ │          │         │
│  │ Deep-dive│ │ Expert   │ │ Improve  │         │
│  │ research │ │ pair     │ │ your     │         │
│  │ & cited  │ │ program- │ │ writing  │         │
│  │ reports  │ │ mer      │ │ with...  │         │
│  │          │ │          │ │          │         │
│  │ [Install]│ │ [Install]│ │ [Install]│         │
│  └──────────┘ └──────────┘ └──────────┘         │
│                                                   │
│  ── Workflows ──────────────────────────          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐         │
│  │ 🌅       │ │ 🌙       │ │ 📬       │         │
│  │ Morning  │ │ EOD      │ │ Inbox    │         │
│  │ Briefing │ │ Summary  │ │ Triage   │         │
│  │ [Install]│ │ [Install]│ │ [Install]│         │
│  └──────────┘ └──────────┘ └──────────┘         │
└─────────────────────────────────────────────────┘
```

**Card component:**
- Icon (emoji, large)
- Name (bold, 16px)
- Description (muted, 14px, 2-line clamp)
- Category pill badge
- `[Install]` button → opens Customization Modal
- If already installed: `[Installed ✓]` → links to agent chat

**Search:** Full-text across name, description, and tags. Debounced, instant results.

**Filters:** Category pills (single-select). "All" default.

### 6.2 Customization Modal

Triggered by clicking `[Install]` on any template.

```
┌──────────────────────────────────────┐
│  Install: Research Assistant 🔍      │
│──────────────────────────────────────│
│                                      │
│  Name:  [Research Assistant      ]   │
│                                      │
│  Model: [Gateway Default ▾      ]   │
│                                      │
│  Thinking: [● Low ○ Med ○ High  ]   │
│                                      │
│  Tools:                              │
│  ☑ web_search  ☑ web_fetch           │
│  ☑ read        ☑ write               │
│  ☐ exec        ☐ message             │
│                                      │
│  System Prompt:                      │
│  ┌──────────────────────────────┐   │
│  │ You are a thorough research  │   │
│  │ assistant. When given a...   │   │
│  │                              │   │
│  └──────────────────────────────┘   │
│  [Reset to Default]                  │
│                                      │
│  Cron Schedules: (none)              │
│  [+ Add Schedule]                    │
│                                      │
│  Channel: [Default ▾]               │
│                                      │
│          [Cancel]  [Install Agent]   │
└──────────────────────────────────────┘
```

**Behavior:**
- All fields are pre-filled from the template but fully editable
- "Reset to Default" restores the template's original values
- Model dropdown lists all models configured in the gateway
- Tools are checkboxes — user can enable/disable any tool
- System prompt is a resizable textarea with syntax-aware font
- `[Install Agent]` writes the agent config to the gateway and navigates to the new agent's chat

### 6.3 My Agents Page

**Route:** `/agents`

```
┌─────────────────────────────────────────────────┐
│  🤖 My Agents                    [+ New Agent]   │
│                                                   │
│  ┌───────────────────────────────────────────┐   │
│  │ 🔍 Research Assistant              [Chat] │   │
│  │ Deep-dive researcher...                   │   │
│  │ Tools: web_search, web_fetch, read, write │   │
│  │ Model: claude-sonnet-4-20250514                │   │
│  │                        [Edit] [Disable] [🗑]│   │
│  └───────────────────────────────────────────┘   │
│                                                   │
│  ┌───────────────────────────────────────────┐   │
│  │ 📰 Daily Briefing                 [Chat] │   │
│  │ Personalized morning summary              │   │
│  │ ⏰ 7:00 AM weekdays                      │   │
│  │                        [Edit] [Disable] [🗑]│   │
│  └───────────────────────────────────────────┘   │
│                                                   │
│  ── Workflows ──────────────────────────          │
│  ┌───────────────────────────────────────────┐   │
│  │ 🌅 Morning Briefing   ⏰ 7:00 AM M-F     │   │
│  │ Next run: Tomorrow 7:00 AM                │   │
│  │                      [Edit] [Pause] [🗑]  │   │
│  └───────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

**Features:**
- List all installed agents and workflows
- `[Chat]` — opens a new session with that agent
- `[Edit]` — opens the customization modal with current config
- `[Disable]` / `[Pause]` — keeps config but stops routing/scheduling
- `[🗑]` — delete with confirmation dialog
- `[+ New Agent]` — opens blank customization modal (or library)
- Workflows show next scheduled run time and run history

---

## 7. Gateway Config Mapping

### How Agents Map to `openclaw.json`

When a user installs an agent from the Starter Library, Pinchr writes to the gateway's `agents[]` array in `openclaw.json`:

```jsonc
{
  "agents": [
    {
      "id": "research-assistant",           // Derived from template slug
      "name": "Research Assistant",
      "systemPrompt": "You are a thorough research assistant...",
      "model": null,                         // null = use gateway default model
      "thinkingLevel": "high",
      "tools": {
        "allow": ["web_search", "web_fetch", "read", "write"]
      },
      "sessions": {
        "routing": "dedicated",              // Each agent gets its own session namespace
        "prefix": "agent:research-assistant" // Session IDs: agent:research-assistant:dm:drew
      }
    }
  ]
}
```

### Session Routing

Each installed agent creates a dedicated session namespace:

```
agent:main:dm:drew                    ← Default main agent
agent:research-assistant:dm:drew      ← Research Assistant sessions
agent:code-helper:dm:drew             ← Code Helper sessions
```

**Routing rules:**
1. Pinchr UI selects the agent at chat creation time
2. The selected agent's `id` determines the session prefix
3. The gateway applies that agent's `systemPrompt`, `model`, `tools`, and `thinkingLevel` overrides
4. Each agent maintains independent conversation history

### Cron Job Mapping

Agent/workflow cron schedules map to the gateway's cron system:

```jsonc
{
  "cron": [
    {
      "id": "morning-briefing",
      "schedule": "0 7 * * 1-5",
      "timezone": "America/New_York",
      "agent": "daily-briefing",             // Routes to this agent's config
      "prompt": "Deliver the morning briefing.",
      "channel": "slack",                     // Delivery channel
      "model": null,
      "enabled": true
    }
  ]
}
```

### Config Operations

| User Action | Gateway Config Change |
|---|---|
| Install agent | Append to `agents[]`, optionally append to `cron[]` |
| Edit agent | Patch matching entry in `agents[]` |
| Delete agent | Remove from `agents[]`, remove related `cron[]` entries |
| Disable agent | Set `enabled: false` on agent and related cron jobs |
| Install workflow | Append to `cron[]` with specified agent or default |
| Pause workflow | Set `enabled: false` on `cron[]` entry |

---

## 8. ClawHub Integration

### What Is ClawHub

ClawHub is the community marketplace for sharing agent templates, workflows, skills, and configurations. Think: npm for AI agents.

### Publishing to ClawHub

From the "My Agents" page, users can:

1. **Export** — Click `[Share to ClawHub]` on any agent
2. **Review** — Modal shows what will be published (system prompt, tools, config). Users can edit the description and add tags.
3. **Publish** — Uploads the template JSON to ClawHub under the user's account
4. **Version** — Subsequent edits can be published as new versions

### Browsing ClawHub

The Library page includes a "Community" tab alongside the "Starter" tab:

```
[Starter Library]  [Community (ClawHub)]
```

Community tab shows:
- Trending agents (most installs this week)
- New & noteworthy (staff picks)
- Search by name, description, tags
- Filter by category
- Each card shows: install count, rating, author, last updated

### Trust & Safety

- **Prompt review:** System prompts are visible before install — no hidden instructions
- **Tool audit:** Users see exactly which tools an agent requests and can disable any
- **Ratings & reports:** Community can rate agents and flag harmful content
- **Verified authors:** Pinchr-authored templates get a ✓ badge
- **Sandboxing:** Community agents run with the same permission model as local agents — no privilege escalation

### ClawHub API (Conceptual)

```
GET    /api/clawhub/templates?category=&q=&sort=trending
GET    /api/clawhub/templates/:id
POST   /api/clawhub/templates                    (publish)
PUT    /api/clawhub/templates/:id                (update)
DELETE /api/clawhub/templates/:id                (unpublish)
GET    /api/clawhub/templates/:id/reviews
POST   /api/clawhub/templates/:id/reviews
```

---

## 9. Implementation Phases

### Phase 1: Core Library (MVP)
- Ship 10 starter agents and 7 workflows as bundled JSON files
- Library browse page with category filters
- One-click install with customization modal
- My Agents page with edit/delete
- Gateway config read/write via `openclaw gateway` CLI

### Phase 2: Workflow Engine
- Cron scheduling with timezone support
- Workflow execution and delivery to channels
- Run history and logs
- Pause/resume controls

### Phase 3: ClawHub
- User accounts and authentication
- Publish/browse/install community templates
- Ratings, reviews, and trust system
- Trending and recommendation algorithms

### Phase 4: Advanced
- Agent-to-agent communication
- Workflow chaining (output of one → input of another)
- Template versioning and auto-update notifications
- A/B testing system prompts

---

*This spec is a living document. Update it as implementation reveals new requirements.*
