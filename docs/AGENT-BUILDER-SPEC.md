# Agent Builder UI — Feature Specification

> **Status:** Draft v1.0  
> **Date:** 2026-02-09  
> **Platform:** Pinchr Desktop (Electron + React 19 + Tailwind CSS + shadcn/ui)

---

## 1. Overview

The Agent Builder is a graphical interface for creating, configuring, and managing OpenClaw agents directly from Pinchr. It replaces manual editing of `~/.openclaw/openclaw.json` and workspace markdown files with a guided wizard, template library, and dashboard.

### Goals

- Zero-CLI agent creation — users never touch JSON or terminal
- Template-first onboarding — pre-built personalities for common use cases
- Full lifecycle management — create, edit, enable/disable, monitor, delete
- Inline workspace editing — SOUL.md, AGENTS.md, TOOLS.md, USER.md, IDENTITY.md
- Real-time sync with the OpenClaw gateway via `/tools/invoke`

---

## 2. Architecture & IPC Flow

```
┌─────────────────────────────────────────────────┐
│  Renderer Process (React 19)                    │
│  ┌───────────────┐  ┌────────────────────────┐  │
│  │ Agent Wizard   │  │ Agent Dashboard        │  │
│  │ AgentEditor    │  │ WorkspaceFileEditor    │  │
│  └──────┬────────┘  └──────────┬─────────────┘  │
│         │ ipcRenderer.invoke()  │                │
├─────────┼───────────────────────┼────────────────┤
│  Main Process (Electron)                        │
│  ┌──────┴───────────────────────┴─────────────┐  │
│  │ AgentService                                │  │
│  │  - validateConfig()                         │  │
│  │  - readOpenClawConfig()                     │  │
│  │  - writeOpenClawConfig()                    │  │
│  │  - readWorkspaceFile()                      │  │
│  │  - writeWorkspaceFile()                     │  │
│  └──────────────────┬─────────────────────────┘  │
│                     │ HTTP POST                   │
├─────────────────────┼────────────────────────────┤
│  OpenClaw Gateway   │                            │
│  POST /tools/invoke │                            │
│  { tool, params }   │                            │
└─────────────────────┘
```

### IPC Channels

| Channel | Direction | Purpose |
|---|---|---|
| `agent:list` | renderer → main → renderer | Get all agents from config |
| `agent:create` | renderer → main | Create agent + workspace |
| `agent:update` | renderer → main | Update agent config |
| `agent:delete` | renderer → main | Remove agent + optionally workspace |
| `agent:toggle` | renderer → main | Enable/disable agent |
| `agent:workspace:read` | renderer → main → renderer | Read a workspace file |
| `agent:workspace:write` | renderer → main | Write a workspace file |
| `binding:list` | renderer → main → renderer | Get all channel bindings |
| `binding:upsert` | renderer → main | Create/update binding |
| `binding:delete` | renderer → main | Remove binding |

### Main Process Service

```typescript
// src/main/services/agentService.ts

import { ipcMain } from 'electron';
import fs from 'fs/promises';
import path from 'path';

const CONFIG_PATH = path.join(os.homedir(), '.openclaw', 'openclaw.json');
const GATEWAY_URL = 'http://127.0.0.1:4880'; // default gateway port

export class AgentService {
  constructor() {
    this.registerHandlers();
  }

  private registerHandlers() {
    ipcMain.handle('agent:list', () => this.listAgents());
    ipcMain.handle('agent:create', (_, agent: AgentCreateInput) => this.createAgent(agent));
    ipcMain.handle('agent:update', (_, id: string, patch: Partial<AgentConfig>) => this.updateAgent(id, patch));
    ipcMain.handle('agent:delete', (_, id: string, removeWorkspace: boolean) => this.deleteAgent(id, removeWorkspace));
    ipcMain.handle('agent:toggle', (_, id: string, enabled: boolean) => this.toggleAgent(id, enabled));
    ipcMain.handle('agent:workspace:read', (_, id: string, filename: string) => this.readWorkspaceFile(id, filename));
    ipcMain.handle('agent:workspace:write', (_, id: string, filename: string, content: string) => this.writeWorkspaceFile(id, filename, content));
    ipcMain.handle('binding:list', () => this.listBindings());
    ipcMain.handle('binding:upsert', (_, binding: ChannelBinding) => this.upsertBinding(binding));
    ipcMain.handle('binding:delete', (_, id: string) => this.deleteBinding(id));
  }

  private async readConfig(): Promise<OpenClawConfig> {
    const raw = await fs.readFile(CONFIG_PATH, 'utf-8');
    return JSON.parse(raw);
  }

  private async writeConfig(config: OpenClawConfig): Promise<void> {
    await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
  }

  /** Notify the gateway that config changed */
  private async syncGateway(): Promise<void> {
    await fetch(`${GATEWAY_URL}/tools/invoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: 'config_reload', params: {} }),
    });
  }

  async listAgents(): Promise<AgentConfig[]> {
    const config = await this.readConfig();
    return config.agents?.list ?? [];
  }

  async createAgent(input: AgentCreateInput): Promise<AgentConfig> {
    const config = await this.readConfig();
    const id = input.id ?? slugify(input.name);
    const workspace = input.workspace ?? path.join(os.homedir(), '.openclaw', 'workspaces', id);

    const agent: AgentConfig = {
      id,
      name: input.name,
      workspace,
      model: input.model ?? 'anthropic/claude-sonnet-4-20250514',
      tools: input.tools ?? [],
      sandbox: input.sandbox ?? { enabled: false },
      enabled: true,
    };

    // Create workspace directory and seed files
    await fs.mkdir(workspace, { recursive: true });
    await fs.writeFile(path.join(workspace, 'SOUL.md'), input.soulMd ?? '# Soul\n\nDescribe this agent\'s personality here.\n');
    await fs.writeFile(path.join(workspace, 'AGENTS.md'), DEFAULT_AGENTS_MD);
    await fs.writeFile(path.join(workspace, 'TOOLS.md'), '# Tools\n\nLocal tool notes.\n');
    await fs.writeFile(path.join(workspace, 'USER.md'), input.userMd ?? '# User\n\nDescribe the user this agent serves.\n');
    await fs.writeFile(path.join(workspace, 'IDENTITY.md'), `# Identity\n\nName: ${input.name}\nID: ${id}\n`);

    config.agents = config.agents ?? { list: [] };
    config.agents.list.push(agent);
    await this.writeConfig(config);
    await this.syncGateway();
    return agent;
  }

  async updateAgent(id: string, patch: Partial<AgentConfig>): Promise<void> {
    const config = await this.readConfig();
    const idx = config.agents.list.findIndex(a => a.id === id);
    if (idx === -1) throw new Error(`Agent ${id} not found`);
    config.agents.list[idx] = { ...config.agents.list[idx], ...patch };
    await this.writeConfig(config);
    await this.syncGateway();
  }

  async deleteAgent(id: string, removeWorkspace: boolean): Promise<void> {
    const config = await this.readConfig();
    const agent = config.agents.list.find(a => a.id === id);
    if (!agent) throw new Error(`Agent ${id} not found`);
    config.agents.list = config.agents.list.filter(a => a.id !== id);
    config.bindings = (config.bindings ?? []).filter(b => b.agentId !== id);
    await this.writeConfig(config);
    if (removeWorkspace && agent.workspace) {
      await fs.rm(agent.workspace, { recursive: true, force: true });
    }
    await this.syncGateway();
  }

  async toggleAgent(id: string, enabled: boolean): Promise<void> {
    await this.updateAgent(id, { enabled });
  }

  async readWorkspaceFile(agentId: string, filename: string): Promise<string> {
    const config = await this.readConfig();
    const agent = config.agents.list.find(a => a.id === agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);
    const filePath = path.join(agent.workspace, filename);
    return fs.readFile(filePath, 'utf-8');
  }

  async writeWorkspaceFile(agentId: string, filename: string, content: string): Promise<void> {
    const config = await this.readConfig();
    const agent = config.agents.list.find(a => a.id === agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);
    const filePath = path.join(agent.workspace, filename);
    await fs.writeFile(filePath, content, 'utf-8');
  }

  async listBindings(): Promise<ChannelBinding[]> {
    const config = await this.readConfig();
    return config.bindings ?? [];
  }

  async upsertBinding(binding: ChannelBinding): Promise<void> {
    const config = await this.readConfig();
    config.bindings = config.bindings ?? [];
    const idx = config.bindings.findIndex(b => b.id === binding.id);
    if (idx >= 0) config.bindings[idx] = binding;
    else config.bindings.push(binding);
    await this.writeConfig(config);
    await this.syncGateway();
  }

  async deleteBinding(id: string): Promise<void> {
    const config = await this.readConfig();
    config.bindings = (config.bindings ?? []).filter(b => b.id !== id);
    await this.writeConfig(config);
    await this.syncGateway();
  }
}
```

---

## 3. TypeScript Interfaces

```typescript
// src/shared/types/agent.ts

export interface AgentConfig {
  id: string;
  name: string;
  workspace: string;
  model: string;
  tools: string[];               // e.g. ["web_search", "exec", "read", "write"]
  sandbox: SandboxConfig;
  enabled: boolean;
  description?: string;
  avatar?: string;               // path or URL
  maxTokens?: number;
  temperature?: number;
  systemPromptOverride?: string;
}

export interface SandboxConfig {
  enabled: boolean;
  image?: string;                // Docker image
  memory?: string;               // e.g. "512m"
  timeout?: number;              // seconds
}

export interface ChannelBinding {
  id: string;
  agentId: string;
  channel: ChannelType;
  channelConfig: ChannelConfig;
  filters?: BindingFilter;
}

export type ChannelType = 'slack' | 'discord' | 'telegram' | 'sms' | 'email' | 'webhook';

export interface ChannelConfig {
  /** Slack: channel ID. Discord: channel/guild ID. Telegram: chat ID. */
  target: string;
  /** Human-readable label */
  label?: string;
}

export interface BindingFilter {
  /** Only trigger on @mention */
  mentionOnly?: boolean;
  /** Only trigger on DMs */
  dmOnly?: boolean;
  /** Regex pattern to match */
  pattern?: string;
}

export interface AgentCreateInput {
  id?: string;
  name: string;
  description?: string;
  workspace?: string;
  model?: string;
  tools?: string[];
  sandbox?: SandboxConfig;
  soulMd?: string;
  userMd?: string;
  templateId?: string;
}

export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;                  // Lucide icon name
  model: string;
  tools: string[];
  soulMd: string;
  userMd: string;
  suggestedBindings: ChannelType[];
}

export interface WorkspaceFile {
  filename: string;
  label: string;
  description: string;
  language: 'markdown';
}

export const WORKSPACE_FILES: WorkspaceFile[] = [
  { filename: 'SOUL.md', label: 'Personality', description: 'Who this agent is — tone, style, values', language: 'markdown' },
  { filename: 'AGENTS.md', label: 'Instructions', description: 'Operational instructions and rules', language: 'markdown' },
  { filename: 'TOOLS.md', label: 'Tool Notes', description: 'Environment-specific tool config', language: 'markdown' },
  { filename: 'USER.md', label: 'User Profile', description: 'Who the agent serves', language: 'markdown' },
  { filename: 'IDENTITY.md', label: 'Identity', description: 'Name, role, metadata', language: 'markdown' },
];

export interface OpenClawConfig {
  agents: {
    list: AgentConfig[];
  };
  bindings: ChannelBinding[];
  [key: string]: unknown;
}

export interface AgentSession {
  sessionId: string;
  agentId: string;
  channel: string;
  startedAt: string;
  lastMessageAt: string;
  messageCount: number;
  status: 'active' | 'idle' | 'ended';
}
```

---

## 4. Agent Templates

```typescript
// src/renderer/features/agents/templates.ts

export const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    id: 'coding-assistant',
    name: 'Coding Assistant',
    description: 'A developer-focused agent with full file system and shell access. Reads code, writes code, runs tests.',
    icon: 'Code2',
    model: 'anthropic/claude-sonnet-4-20250514',
    tools: ['read', 'write', 'edit', 'exec', 'process', 'web_search', 'web_fetch'],
    soulMd: `# Soul

You are a senior software engineer. You write clean, well-tested code. You prefer simplicity over cleverness. You explain your reasoning before writing code. You never introduce dependencies without justification.

## Style
- Concise responses — code speaks louder than words
- Always run tests after changes
- Use the project's existing patterns
- Ask before making architectural changes
`,
    userMd: '# User\n\nA software developer working on various projects.\n',
    suggestedBindings: ['slack', 'discord'],
  },
  {
    id: 'research-agent',
    name: 'Research Agent',
    description: 'Searches the web, reads articles, and synthesizes findings into clear summaries.',
    icon: 'Search',
    model: 'anthropic/claude-sonnet-4-20250514',
    tools: ['web_search', 'web_fetch', 'read', 'write'],
    soulMd: `# Soul

You are a meticulous researcher. You find primary sources, cross-reference claims, and present balanced summaries. You always cite your sources with URLs. You distinguish between facts and opinions.

## Style
- Lead with the key finding
- Use bullet points for multiple facts
- Always include source URLs
- Flag uncertainty explicitly
`,
    userMd: '# User\n\nSomeone who needs well-sourced answers to complex questions.\n',
    suggestedBindings: ['slack', 'discord', 'telegram'],
  },
  {
    id: 'team-bot',
    name: 'Team Bot',
    description: 'A helpful presence in team channels. Answers questions, summarizes threads, and assists with coordination.',
    icon: 'Users',
    model: 'anthropic/claude-sonnet-4-20250514',
    tools: ['web_search', 'web_fetch', 'message'],
    soulMd: `# Soul

You are a friendly team assistant. You help with questions, summarize discussions, and keep things organized. You're concise in group chats — no walls of text. You use reactions when a full response isn't needed.

## Rules
- Keep responses under 200 words in group chats
- Use threads for detailed answers
- Don't dominate conversations
- React with emoji when appropriate
`,
    userMd: '# User\n\nA team of people collaborating in chat.\n',
    suggestedBindings: ['slack', 'discord'],
  },
  {
    id: 'personal-assistant',
    name: 'Personal Assistant',
    description: 'A proactive personal AI — manages reminders, checks email, monitors calendars, and handles daily briefings.',
    icon: 'Sparkles',
    model: 'anthropic/claude-opus-4-6',
    tools: ['web_search', 'web_fetch', 'read', 'write', 'exec', 'message', 'nodes', 'tts'],
    soulMd: `# Soul

You are a thoughtful personal assistant. You're proactive but not annoying. You check in a few times a day, handle routine tasks, and only interrupt for things that matter. You learn preferences over time and anticipate needs.

## Personality
- Warm, efficient, slightly witty
- Respects quiet hours (11pm-8am)
- Batches updates instead of sending many small messages
- Uses memory files to maintain continuity
`,
    userMd: '# User\n\nYour human. Learn their preferences, habits, and priorities over time.\n',
    suggestedBindings: ['slack', 'telegram', 'sms'],
  },
  {
    id: 'customer-support',
    name: 'Customer Support',
    description: 'Handles inbound customer questions with a friendly, professional tone. Escalates when needed.',
    icon: 'Headphones',
    model: 'anthropic/claude-sonnet-4-20250514',
    tools: ['web_search', 'web_fetch', 'read'],
    soulMd: `# Soul

You are a patient, empathetic customer support agent. You answer questions accurately, de-escalate frustration, and know when to hand off to a human. You never make promises you can't keep.

## Rules
- Always greet the customer warmly
- Acknowledge their issue before solving it
- If unsure, say so — don't guess
- Escalate billing/legal/security issues to humans immediately
- Keep responses clear and jargon-free
`,
    userMd: '# User\n\nCustomers reaching out for help with your product or service.\n',
    suggestedBindings: ['slack', 'discord', 'email', 'webhook'],
  },
];
```

---

## 5. UI Screens

### 5.1 Agent Dashboard (`/agents`)

The main landing page. Shows all agents in a card grid.

**Layout:**
- Top bar: "Agents" heading + **"+ New Agent"** button (primary)
- Filter/search bar below
- Card grid (responsive: 1-3 columns)

**Each Agent Card:**
```
┌─────────────────────────────────────┐
│ [Avatar]  Agent Name        [Toggle]│
│           model-name                │
│                                     │
│ 3 channels · 12 sessions today     │
│                                     │
│ [Edit]  [Workspace]  [···]         │
└─────────────────────────────────────┘
```

- **Toggle**: Switch to enable/disable (calls `agent:toggle`)
- **Edit**: Opens agent settings panel
- **Workspace**: Opens file editor
- **···**: Overflow menu — Duplicate, Export JSON, Delete

**Empty State:** Illustration + "Create your first agent" CTA that opens the wizard.

```tsx
// src/renderer/features/agents/AgentDashboard.tsx

export function AgentDashboard() {
  const { data: agents, isLoading } = useAgents();
  const [search, setSearch] = useState('');

  const filtered = agents?.filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Agents</h1>
        <Link to="/agents/new">
          <Button><Plus className="mr-2 h-4 w-4" /> New Agent</Button>
        </Link>
      </div>

      <Input
        placeholder="Search agents..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="max-w-sm"
      />

      {filtered?.length === 0 && !isLoading ? (
        <AgentEmptyState />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered?.map(agent => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      )}
    </div>
  );
}
```

### 5.2 Agent Creation Wizard (`/agents/new`)

A multi-step wizard using shadcn/ui `Tabs` or a custom stepper.

**Steps:**

#### Step 1: Choose Template or Start Blank
- Grid of template cards (icon + name + description)
- "Start from scratch" option at the bottom
- Selecting a template pre-fills subsequent steps

#### Step 2: Name & Identity
- **Name** (required) — text input, auto-generates slug ID
- **Description** — textarea, 1-2 sentences
- **Avatar** — optional image upload or emoji picker
- Preview of the agent card as it will appear on the dashboard

#### Step 3: Personality (SOUL.md)
- Full markdown editor (Monaco or CodeMirror) pre-filled from template
- Side panel with tips: "What makes a good SOUL.md?"
- Character count / token estimate

#### Step 4: Model Selection
- Radio group of available models grouped by provider:
  - **Anthropic:** Claude Opus 4.6, Claude Sonnet 4.5, Claude Haiku
  - **OpenAI:** GPT-5, GPT-4.1, GPT-4.1-mini
- Each option shows: name, speed rating, cost tier, context window
- Advanced: temperature slider, max tokens input

#### Step 5: Tool Permissions
- Checklist with categories:
  - **File System:** read, write, edit
  - **Execution:** exec, process
  - **Web:** web_search, web_fetch, browser
  - **Communication:** message, tts
  - **Devices:** nodes, canvas
- Each tool has a description tooltip
- Template pre-selects appropriate tools
- Warning badge on dangerous tools (exec, browser)

#### Step 6: Channel Routing
- List of available channels (detected from OpenClaw config)
- For each channel: toggle on/off, configure filters (mention-only, DM-only, pattern)
- Preview: "This agent will respond in #general on Slack when mentioned"

#### Step 7: Review & Create
- Summary of all settings
- JSON preview (collapsible)
- **"Create Agent"** button
- On success: redirect to dashboard with toast notification

```tsx
// src/renderer/features/agents/AgentWizard.tsx

const STEPS = ['template', 'identity', 'personality', 'model', 'tools', 'channels', 'review'] as const;

export function AgentWizard() {
  const [step, setStep] = useState<number>(0);
  const [draft, setDraft] = useState<AgentCreateInput>({
    name: '',
    model: 'anthropic/claude-sonnet-4-20250514',
    tools: [],
  });

  const createAgent = useCreateAgent();

  const handleCreate = async () => {
    await createAgent.mutateAsync(draft);
    navigate('/agents');
    toast.success(`Agent "${draft.name}" created!`);
  };

  return (
    <div className="mx-auto max-w-3xl p-6">
      <WizardStepper steps={STEPS} current={step} />

      {step === 0 && <TemplateStep draft={draft} setDraft={setDraft} />}
      {step === 1 && <IdentityStep draft={draft} setDraft={setDraft} />}
      {step === 2 && <PersonalityStep draft={draft} setDraft={setDraft} />}
      {step === 3 && <ModelStep draft={draft} setDraft={setDraft} />}
      {step === 4 && <ToolsStep draft={draft} setDraft={setDraft} />}
      {step === 5 && <ChannelsStep draft={draft} setDraft={setDraft} />}
      {step === 6 && <ReviewStep draft={draft} onCreate={handleCreate} />}

      <div className="mt-8 flex justify-between">
        <Button variant="ghost" onClick={() => setStep(s => s - 1)} disabled={step === 0}>
          Back
        </Button>
        {step < STEPS.length - 1 && (
          <Button onClick={() => setStep(s => s + 1)}>Continue</Button>
        )}
      </div>
    </div>
  );
}
```

### 5.3 Agent Editor (`/agents/:id`)

Tabbed interface for editing an existing agent.

**Tabs:**
- **General** — name, description, avatar, model, temperature
- **Personality** — SOUL.md editor
- **Tools** — same checklist as wizard
- **Channels** — binding management
- **Workspace** — file browser/editor for all workspace files
- **Sessions** — table of recent sessions (read-only, from gateway)

### 5.4 Workspace File Editor

An inline markdown editor embedded in the Agent Editor's Workspace tab.

**Layout:**
- Left sidebar: file list (SOUL.md, AGENTS.md, TOOLS.md, USER.md, IDENTITY.md)
- Right pane: editor with:
  - CodeMirror 6 with markdown syntax highlighting
  - Live preview toggle (split or tab)
  - Save button (Cmd+S shortcut)
  - Revert to last saved
  - Diff view for unsaved changes

```tsx
// src/renderer/features/agents/WorkspaceEditor.tsx

export function WorkspaceEditor({ agentId }: { agentId: string }) {
  const [activeFile, setActiveFile] = useState('SOUL.md');
  const { data: content, isLoading } = useWorkspaceFile(agentId, activeFile);
  const saveFile = useSaveWorkspaceFile();
  const [edited, setEdited] = useState('');

  useEffect(() => {
    if (content !== undefined) setEdited(content);
  }, [content]);

  const isDirty = edited !== content;

  useHotkeys('mod+s', (e) => {
    e.preventDefault();
    if (isDirty) saveFile.mutate({ agentId, filename: activeFile, content: edited });
  });

  return (
    <div className="flex h-[600px] rounded-lg border">
      <div className="w-48 border-r p-2 space-y-1">
        {WORKSPACE_FILES.map(f => (
          <button
            key={f.filename}
            onClick={() => setActiveFile(f.filename)}
            className={cn(
              'w-full rounded px-3 py-2 text-left text-sm',
              activeFile === f.filename ? 'bg-accent font-medium' : 'hover:bg-muted'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="flex-1 flex flex-col">
        <div className="flex items-center justify-between border-b px-4 py-2">
          <span className="text-sm text-muted-foreground">{activeFile}</span>
          <Button size="sm" disabled={!isDirty} onClick={() => saveFile.mutate({ agentId, filename: activeFile, content: edited })}>
            {isDirty ? 'Save' : 'Saved'}
          </Button>
        </div>
        <CodeMirrorEditor
          value={edited}
          onChange={setEdited}
          language="markdown"
          className="flex-1"
        />
      </div>
    </div>
  );
}
```

---

## 6. Data Hooks (React Query)

```typescript
// src/renderer/features/agents/hooks.ts

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const ipc = window.electronAPI; // preload bridge

export function useAgents() {
  return useQuery({
    queryKey: ['agents'],
    queryFn: () => ipc.invoke('agent:list'),
  });
}

export function useAgent(id: string) {
  const { data: agents } = useAgents();
  return agents?.find(a => a.id === id);
}

export function useCreateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AgentCreateInput) => ipc.invoke('agent:create', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents'] }),
  });
}

export function useUpdateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<AgentConfig> }) =>
      ipc.invoke('agent:update', id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents'] }),
  });
}

export function useDeleteAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, removeWorkspace }: { id: string; removeWorkspace: boolean }) =>
      ipc.invoke('agent:delete', id, removeWorkspace),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents'] }),
  });
}

export function useToggleAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      ipc.invoke('agent:toggle', id, enabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents'] }),
  });
}

export function useWorkspaceFile(agentId: string, filename: string) {
  return useQuery({
    queryKey: ['workspace', agentId, filename],
    queryFn: () => ipc.invoke('agent:workspace:read', agentId, filename),
    enabled: !!agentId && !!filename,
  });
}

export function useSaveWorkspaceFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, filename, content }: { agentId: string; filename: string; content: string }) =>
      ipc.invoke('agent:workspace:write', agentId, filename, content),
    onSuccess: (_, { agentId, filename }) =>
      qc.invalidateQueries({ queryKey: ['workspace', agentId, filename] }),
  });
}
```

---

## 7. File Structure

```
src/
├── main/
│   └── services/
│       └── agentService.ts          # IPC handlers + config read/write
├── shared/
│   └── types/
│       └── agent.ts                 # All interfaces above
├── renderer/
│   └── features/
│       └── agents/
│           ├── AgentDashboard.tsx    # Card grid + search
│           ├── AgentCard.tsx         # Individual agent card
│           ├── AgentEmptyState.tsx   # No agents CTA
│           ├── AgentWizard.tsx       # Multi-step creation
│           ├── steps/
│           │   ├── TemplateStep.tsx
│           │   ├── IdentityStep.tsx
│           │   ├── PersonalityStep.tsx
│           │   ├── ModelStep.tsx
│           │   ├── ToolsStep.tsx
│           │   ├── ChannelsStep.tsx
│           │   └── ReviewStep.tsx
│           ├── AgentEditor.tsx       # Tabbed edit view
│           ├── WorkspaceEditor.tsx   # Markdown file editor
│           ├── templates.ts          # Template definitions
│           └── hooks.ts             # React Query hooks
```

---

## 8. Implementation Plan

| Phase | Scope | Estimate |
|---|---|---|
| **1** | TypeScript interfaces, AgentService in main process, IPC bridge | 2 days |
| **2** | Agent Dashboard (list, cards, toggle, delete) | 2 days |
| **3** | Agent Wizard (all 7 steps) | 3 days |
| **4** | Templates library | 1 day |
| **5** | Agent Editor (tabbed settings) | 2 days |
| **6** | Workspace file editor with CodeMirror | 2 days |
| **7** | Channel binding UI | 1 day |
| **8** | Sessions view (read-only) | 1 day |
| **Total** | | **~14 days** |

### Dependencies

```json
{
  "@codemirror/lang-markdown": "^6.3.1",
  "@codemirror/state": "^6.5.0",
  "@codemirror/view": "^6.35.0",
  "@tanstack/react-query": "^5.62.0",
  "react-hotkeys-hook": "^4.6.1"
}
```

---

## 9. Edge Cases & Considerations

- **Config conflicts:** If the user edits `openclaw.json` manually while Pinchr is open, detect file changes via `fs.watch` and prompt to reload.
- **Gateway offline:** Show a banner "Gateway not running" with a button to start it (`openclaw gateway start`). Disable create/edit actions.
- **Workspace missing:** If an agent's workspace directory doesn't exist, show a "Repair" button that recreates it with default files.
- **Agent ID collisions:** Validate uniqueness on the IdentityStep before allowing continue.
- **Large SOUL.md:** CodeMirror handles large files well, but add a soft warning at >10KB suggesting the user trim it.
- **Binding validation:** Prevent binding the same channel to multiple agents without explicit confirmation.

---

## 10. Future Enhancements

- **Agent marketplace** — share/import agent configs as `.openclaw-agent` bundles
- **Live testing** — chat with the agent inline from the editor before deploying
- **Version history** — git-backed workspace files with diff viewer
- **Usage analytics** — token costs, response times, session duration charts
- **Agent cloning** — duplicate an agent with one click and customize the copy
