# Card Framework Spec (json-render)

## Overview

Pinchr uses [json-render](https://github.com/vercel-labs/json-render) by Vercel as the rendering engine for agent-generated UI. The agent produces JSON specs describing what to display; Pinchr renders them with pre-built React components constrained by a typed catalog.

## Architecture

```
┌──────────────┐     JSON spec      ┌──────────────┐     React        ┌──────────────┐
│  OpenClaw    │ ──────────────────→ │  json-render │ ──────────────→ │  Pinchr UI   │
│  Agent       │                     │  Renderer    │                  │  (screen)    │
└──────────────┘                     └──────────────┘                  └──────────────┘
       ↑                                    ↑
  Decides WHAT                        Component catalog
  to show                            defines HOW to render
```

### Key Decisions

1. **Hybrid rendering model**: Default views are client-rendered from data (dashboard always shows schedule + pending). Agent CAN inject custom specs for dynamic/non-standard content.
2. **Cross-platform catalog**: Same component definitions → separate registries for React (desktop/web) and React Native (mobile). Specs are platform-agnostic.
3. **Skills ship components**: ClawHub skills include component definitions + registry entries. Install skill → new card types available.
4. **Streaming**: json-render supports progressive rendering. Cards appear as the agent streams its response.

## Component Catalog

### Communication

#### EmailCard
Displays an email with agent summary and draft reply.
```typescript
EmailCard: {
  props: z.object({
    from: z.string(),
    subject: z.string(),
    summary: z.string(),
    draftReply: z.string().optional(),
    priority: z.enum(['urgent', 'normal', 'low']),
    timestamp: z.string(),
    labels: z.array(z.string()).optional(),
  }),
  description: "Email requiring review or action",
}
```
Actions: `approve_reply`, `edit_reply`, `archive`, `flag`, `respond`

#### MessageCard
Displays a message from any channel with context.
```typescript
MessageCard: {
  props: z.object({
    channel: z.enum(['sms', 'whatsapp', 'slack', 'imessage', 'telegram', 'discord', 'email']),
    sender: z.string(),
    preview: z.string(),
    draftReply: z.string().optional(),
    conversationId: z.string().optional(),
    timestamp: z.string(),
  }),
  description: "Message from any channel needing attention",
}
```
Actions: `approve_reply`, `edit_reply`, `dismiss`, `view_thread`

#### ChannelSummary
Overview of activity across a communication channel.
```typescript
ChannelSummary: {
  props: z.object({
    channel: z.string(),
    unread: z.number(),
    handled: z.number(),
    needsAttention: z.number(),
    highlights: z.array(z.string()).optional(),
  }),
  description: "Summary of channel activity",
}
```

### Schedule

#### EventCard
A calendar event with context and actions.
```typescript
EventCard: {
  props: z.object({
    title: z.string(),
    startTime: z.string(),
    endTime: z.string().optional(),
    location: z.string().optional(),
    attendees: z.array(z.string()).optional(),
    notes: z.string().optional(),
    conflict: z.boolean().optional(),
    conflictWith: z.string().optional(),
  }),
  description: "Calendar event with optional conflict highlighting",
}
```
Actions: `accept`, `decline`, `reschedule`, `add_notes`

#### ScheduleView
Day/week schedule overview.
```typescript
ScheduleView: {
  props: z.object({
    date: z.string(),
    events: z.array(z.object({
      title: z.string(),
      startTime: z.string(),
      endTime: z.string(),
      type: z.enum(['meeting', 'focus', 'personal', 'travel']),
    })),
    focusBlocks: z.number().optional(),
    nextEvent: z.string().optional(),
  }),
  description: "Day or week schedule overview",
}
```

#### ConflictResolver
Calendar conflict requiring decision.
```typescript
ConflictResolver: {
  props: z.object({
    event1: z.object({ title: z.string(), time: z.string() }),
    event2: z.object({ title: z.string(), time: z.string() }),
    suggestions: z.array(z.object({
      description: z.string(),
      action: z.string(),
    })),
  }),
  description: "Calendar conflict with resolution options",
}
```

### Artifacts

#### DocumentPreview
Preview of a document with inline review.
```typescript
DocumentPreview: {
  props: z.object({
    title: z.string(),
    format: z.enum(['markdown', 'docx', 'pdf', 'txt']),
    preview: z.string(), // First N characters or summary
    fullContent: z.string().optional(),
    status: z.enum(['draft', 'review', 'final']),
    createdBy: z.string().optional(),
  }),
  description: "Document preview with review actions",
}
```
Actions: `approve`, `edit`, `export`, `share`, `request_revision`

#### DataCard
Data visualization with key metrics and optional chart.
```typescript
DataCard: {
  props: z.object({
    title: z.string(),
    metrics: z.array(z.object({
      label: z.string(),
      value: z.string(),
      change: z.string().optional(),
      trend: z.enum(['up', 'down', 'flat']).optional(),
    })),
    chartType: z.enum(['bar', 'line', 'pie', 'area']).optional(),
    chartData: z.any().optional(), // Flexible for chart libraries
    insight: z.string().optional(),
  }),
  description: "Data visualization with metrics and optional chart",
}
```

#### CodeReview
Code changes requiring review.
```typescript
CodeReview: {
  props: z.object({
    repo: z.string(),
    branch: z.string(),
    description: z.string(),
    filesChanged: z.number(),
    additions: z.number(),
    deletions: z.number(),
    files: z.array(z.object({
      path: z.string(),
      status: z.enum(['added', 'modified', 'deleted']),
      summary: z.string(),
    })),
    status: z.enum(['pending', 'approved', 'changes-requested']),
  }),
  description: "Code changes for review with file summaries",
}
```
Actions: `approve`, `request_changes`, `view_diff`, `merge`

#### PresentationPreview
Slide deck preview.
```typescript
PresentationPreview: {
  props: z.object({
    title: z.string(),
    slideCount: z.number(),
    slides: z.array(z.object({
      number: z.number(),
      title: z.string(),
      preview: z.string(), // Summary or thumbnail URL
    })),
    status: z.enum(['draft', 'review', 'final']),
  }),
  description: "Presentation deck preview with slide navigation",
}
```
Actions: `approve`, `edit_slide`, `export_pdf`, `export_pptx`

### Actions

#### ApprovalCard
Generic approval request.
```typescript
ApprovalCard: {
  props: z.object({
    title: z.string(),
    description: z.string(),
    context: z.string().optional(),
    urgency: z.enum(['low', 'normal', 'high']).optional(),
  }),
  description: "Action requiring human approval",
}
```
Actions: `approve`, `reject`, `modify`, `defer`

#### DecisionCard
Multi-option decision point.
```typescript
DecisionCard: {
  props: z.object({
    question: z.string(),
    context: z.string().optional(),
    options: z.array(z.object({
      label: z.string(),
      description: z.string(),
      action: z.string(),
      recommended: z.boolean().optional(),
    })),
  }),
  description: "Decision point with multiple options",
}
```

### Activity

#### ActivityItem
Single activity event in the stream.
```typescript
ActivityItem: {
  props: z.object({
    type: z.enum(['tool_call', 'sub_agent', 'communication', 'code', 'research', 'file', 'system']),
    title: z.string(),
    description: z.string().optional(),
    status: z.enum(['in_progress', 'completed', 'failed', 'waiting']),
    timestamp: z.string(),
    duration: z.string().optional(),
    expandable: z.boolean().optional(),
    details: z.string().optional(),
  }),
  description: "Single activity event in the stream",
}
```

#### SubAgentCard
Sub-agent task with progress and results.
```typescript
SubAgentCard: {
  props: z.object({
    taskName: z.string(),
    agentId: z.string().optional(),
    status: z.enum(['queued', 'running', 'completed', 'failed']),
    progress: z.string().optional(),
    filesChanged: z.array(z.string()).optional(),
    summary: z.string().optional(),
    startedAt: z.string(),
    completedAt: z.string().optional(),
  }),
  description: "Background sub-agent task with status and results",
}
```
Actions: `view_transcript`, `review_changes`, `approve`, `retry`

### Layout

#### Section
Groups related cards with a title.
```typescript
Section: {
  props: z.object({
    title: z.string(),
    priority: z.enum(['attention', 'normal', 'background']).optional(),
    collapsible: z.boolean().optional(),
    badge: z.number().optional(),
  }),
  description: "Section grouping for related cards",
}
```

#### MetricRow
Horizontal row of key metrics.
```typescript
MetricRow: {
  props: z.object({
    metrics: z.array(z.object({
      label: z.string(),
      value: z.string(),
      format: z.enum(['number', 'currency', 'percent', 'duration']).optional(),
      trend: z.enum(['up', 'down', 'flat']).optional(),
    })),
  }),
  description: "Row of key metrics displayed inline",
}
```

## Rendering Flow

### 1. Dashboard Load (Client-Side Defaults)

When Pinchr opens, before any agent response:
1. Fetch gateway sessions (`sessions_list`)
2. Fetch recent tool calls from session history
3. Render default dashboard with:
   - Pending actions from recent tool results
   - Schedule from calendar skill (if connected)
   - Recent activity from session history
   - Conversational input ready

### 2. Agent Response (Dynamic Specs)

When the agent responds with a JSON spec:
1. Parse spec from stream (progressive rendering)
2. Validate against catalog (reject unknown components)
3. Render cards in the activity stream / dashboard
4. Wire up actions to agent commands

### 3. User Interaction

When user taps an action on a card:
1. Action mapped to agent command via catalog definition
2. Command sent to agent (through gateway or companion relay)
3. Agent processes, returns updated spec or confirmation
4. Card updates in place (optimistic UI where appropriate)

## Skill Integration

### How Skills Ship Components

```
my-finance-skill/
├── SKILL.md           # OpenClaw skill definition
├── components/
│   ├── catalog.ts     # Component definitions (schemas + descriptions)
│   └── registry.tsx   # React component implementations
├── scripts/
│   └── ...            # Skill logic
└── package.json
```

### Catalog Extension

```typescript
// my-finance-skill/components/catalog.ts
export const financeComponents = {
  InvoiceCard: {
    props: z.object({
      client: z.string(),
      amount: z.string(),
      dueDate: z.string(),
      status: z.enum(['draft', 'sent', 'paid', 'overdue']),
    }),
    description: "Invoice with payment status and actions",
  },
  ExpenseCard: { ... },
  BudgetChart: { ... },
};

export const financeActions = {
  send_invoice: { description: "Send invoice to client" },
  mark_paid: { description: "Mark invoice as paid" },
};
```

### Runtime Loading

1. Pinchr scans installed skills for `components/catalog.ts`
2. Merges skill catalogs into base Pinchr catalog
3. Registers skill components in renderer
4. Agent's system prompt updated with new component descriptions
5. Agent can now generate specs using skill components

## Cross-Platform Strategy

### Shared
- Catalog definitions (schemas, descriptions, actions)
- JSON specs (platform-agnostic)
- Agent-side generation logic

### Platform-Specific
- **Desktop (Electron + React)**: Full component library with rich interactions, hover states, keyboard shortcuts
- **Web (Next.js + React)**: Same React components, responsive for mobile browsers
- **Mobile (React Native)**: Native component registry, touch-optimized, simplified layouts

### Example: EmailCard

```typescript
// Desktop/Web registry
EmailCard: ({ props, emit }) => (
  <Card className="email-card" priority={props.priority}>
    <CardHeader>
      <Avatar name={props.from} />
      <div>
        <h4>{props.subject}</h4>
        <span className="text-muted">{props.from} · {props.timestamp}</span>
      </div>
    </CardHeader>
    <CardBody>
      <p>{props.summary}</p>
      {props.draftReply && (
        <DraftPreview text={props.draftReply} />
      )}
    </CardBody>
    <CardActions>
      <Button onClick={() => emit('approve_reply')}>Send Reply</Button>
      <Button variant="ghost" onClick={() => emit('edit_reply')}>Edit</Button>
      <Button variant="ghost" onClick={() => emit('archive')}>Archive</Button>
    </CardActions>
  </Card>
),

// React Native registry
EmailCard: ({ props, emit }) => (
  <TouchableCard onPress={() => emit('view_thread')}>
    <Row>
      <Avatar name={props.from} size={40} />
      <Column flex={1}>
        <Text style={styles.subject}>{props.subject}</Text>
        <Text style={styles.meta}>{props.from} · {props.timestamp}</Text>
      </Column>
      <PriorityBadge level={props.priority} />
    </Row>
    <Text style={styles.summary} numberOfLines={2}>{props.summary}</Text>
    <ActionRow>
      <ActionButton label="Send" onPress={() => emit('approve_reply')} />
      <ActionButton label="Edit" onPress={() => emit('edit_reply')} secondary />
    </ActionRow>
  </TouchableCard>
),
```

## Implementation Phases

### Phase 1: Foundation
- [ ] Install `@json-render/core` + `@json-render/react` in desktop repo
- [ ] Define base catalog with 5-6 core components (ActivityItem, ApprovalCard, Section, MetricRow, MessageCard, SubAgentCard)
- [ ] Build React registry for base components using existing Pinchr design system
- [ ] Integrate Renderer into Dashboard page
- [ ] Agent can generate simple specs for activity items

### Phase 2: Core Cards
- [ ] Full communication cards (EmailCard, MessageCard, ChannelSummary)
- [ ] Schedule cards (EventCard, ScheduleView, ConflictResolver)
- [ ] Action cards (ApprovalCard, DecisionCard)
- [ ] Wire actions to agent commands via gateway

### Phase 3: Artifact Cards
- [ ] DocumentPreview with inline editing
- [ ] DataCard with chart rendering
- [ ] CodeReview with diff display
- [ ] PresentationPreview

### Phase 4: Ecosystem
- [ ] Skill component loading from ClawHub packages
- [ ] React Native registry for mobile
- [ ] Catalog extension API for third-party skills
- [ ] Component hot-reload during development

---

*This spec defines the card framework architecture. Individual component designs will evolve as we build and test. The catalog is additive — new components can always be added without breaking existing specs.*

*References: VISION.md, json-render docs*
*Last updated: 2026-02-14*
