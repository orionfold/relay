---
title: Chat UI Shell
status: completed
priority: P1
milestone: post-mvp
source: brainstorm (2026-03-22)
dependencies: [chat-api-routes, app-shell, operational-surface-foundation]
---

# Chat UI Shell

## Description

The main chat page layout with conversation list sidebar, message area, hero empty state, and responsive breakpoints. Adds the Chat nav item to the Work section of the sidebar, positioned after Inbox for high visibility.

Unlike other pages that use PageShell with title/description/filters, the chat page uses a full-bleed layout (no title bar) to maximize message space — similar to Claude.ai and ChatGPT. The conversation list is a left panel within the chat route (not a separate page) to avoid full page reloads on conversation switch.

## User Story

As a user, I want a dedicated chat page in the Work section where I can start conversations, browse history, and interact with an AI assistant that knows my ainative setup.

## Technical Approach

### Page Route (`src/app/chat/page.tsx`)
- Server Component that loads initial data:
  - Conversations list (via `listConversations()`)
  - Suggested prompts (via `buildSuggestedPrompts()`)
- Passes data as props to the client ChatShell component
- No PageShell wrapper — chat manages its own full-bleed layout

### Chat Shell (`src/components/chat/chat-shell.tsx`)
- Top-level client component managing layout and state
- Desktop (lg:): `grid grid-cols-[280px_1fr]` with conversation list + message area
- Tablet/Mobile (<1024px): full-width message area, conversation list via Sheet overlay
- State: active conversation ID, streaming status, messages
- Handles conversation CRUD via API calls
- Outer container: `bg-background min-h-screen flex flex-col`

### Empty State (`src/components/chat/chat-empty-state.tsx`)
- Full-bleed hero centered vertically when no conversation is active:
  - Bot icon (`h-12 w-12 text-muted-foreground`)
  - "What can I help you with?" heading (`text-xl font-semibold`)
  - 2x2 suggestion chips grid from suggested-prompts API
  - Centered prompt input (ChatInput in hero mode)
- Shows when: no conversations exist, OR conversations exist but none selected

### Suggestion Chips (`src/components/chat/chat-suggestion-grid.tsx`)
- `grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg mx-auto`
- Each chip: `flex items-center gap-3 p-3 rounded-lg border border-border bg-card transition-colors hover:border-border-strong`
- Icon + label, click inserts prompt text into input
- Categories: project-aware, task-aware, document-aware, system

### Conversation List (`src/components/chat/chat-conversation-list.tsx`)
- Left panel: `w-[280px] border-r border-border bg-muted flex flex-col hidden lg:flex`
- Header: "New Chat" button (`Button variant="outline" size="sm" w-full`)
- List items: title (truncated), last message preview, relative timestamp, active indicator (`bg-accent text-accent-foreground`)
- Context menu: rename, archive, delete
- Mobile: rendered inside Sheet overlay triggered by list icon in chat header

### Sidebar Navigation Update (`src/components/shared/app-sidebar.tsx`)
- Add `{ title: "Chat", href: "/chat", icon: MessageCircle }` to Work group after Inbox
- Import `MessageCircle` from `lucide-react`
- Nav order: Dashboard → Inbox → **Chat** → Projects → Workflows → Documents

### Responsive Breakpoints
- `< 768px` (mobile): Full-screen messages, Sheet for conversation list, safe-area padding
- `768px - 1023px` (tablet): Same as mobile but wider bubbles
- `>= 1024px` (desktop): Two-column grid with conversation list panel

## Acceptance Criteria

- [ ] Chat page renders at `/chat` route with full-bleed layout (no PageShell title bar)
- [ ] Empty state shows hero prompt with bot icon, greeting, and suggested prompt chips
- [ ] Conversation list shows all conversations sorted by updatedAt desc
- [ ] Active conversation is visually highlighted in the list (`bg-accent`)
- [ ] "New Chat" button creates a fresh conversation via API
- [ ] Clicking a conversation in the list loads its messages
- [ ] Mobile: conversation list accessible via Sheet overlay
- [ ] Chat appears in sidebar Work group between Inbox and Projects
- [ ] Suggestion chips populate from server-side suggested prompts
- [ ] Clicking a suggestion chip inserts its text into the input

## Scope Boundaries

**Included:**
- Page layout, route, and Server Component data loading
- Conversation list panel (desktop + mobile Sheet)
- Empty state hero with suggestions
- Sidebar navigation update
- Responsive breakpoints

**Excluded:**
- Message rendering / streaming (chat-message-rendering feature)
- Input composer / model selector (chat-input-composer feature)
- Chat engine / context building (chat-engine feature)

## References

- Source: Brainstorm session 2026-03-22
- Related features: Depends on chat-api-routes. Enables chat-message-rendering, chat-input-composer
- Pattern reference: `src/components/shared/app-sidebar.tsx` (nav), `src/components/shared/page-shell.tsx` (fullBleed), `src/components/ui/sheet.tsx` (mobile overlay)
- UX handoff: DV=5, MI=4, VD=6. Hero prompt area gets elevation-2, rounded-xl. Calm Ops aesthetic
