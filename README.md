# ainative

> Companion software for the *AI Native Business* book by Manav Sehgal — a local-first agent runtime and builder scaffold for AI-native businesses.

[![AI Business Operating System](https://img.shields.io/badge/AI_Business-Operating_System-6366F1)](https://ainative.business) [![npm](https://img.shields.io/npm/v/ainative-business)](https://www.npmjs.com/package/ainative-business) [![Next.js 16](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org/) [![React 19](https://img.shields.io/badge/React-19-61DAFB)](https://react.dev/) [![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6)](https://www.typescriptlang.org/) [![Claude Agent SDK](https://img.shields.io/badge/Claude-Agent_SDK-D97706)](https://docs.anthropic.com/) [![OpenAI Codex App Server](https://img.shields.io/badge/OpenAI-Codex_App_Server-10A37F)](https://developers.openai.com/codex/app-server) [![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

**[ainative.business](https://ainative.business)** · **[GitHub](https://github.com/manavsehgal/ainative)**

## Quick Start

```bash
npx ainative-business
```

Open [localhost:3000](http://localhost:3000). That's it — zero config, local SQLite, own your data.

**Profiles & Policies** · **Blueprints & Schedules** · **Built-in Playbook** · **Open Source**

<img src="https://raw.githubusercontent.com/manavsehgal/ainative/main/public/readme/home-list.png" alt="ainative-business home workspace" width="1200" />

| Home Workspace | Reusable Profiles | Workflow Blueprints | Governed Execution |
|:-:|:-:|:-:|:-:|
| Workspace briefing with active work, pending review, project signals, and live activity | Specialist definitions with prompts, tool policy, and runtime tuning you can reuse | Pre-configured templates with dynamic forms, YAML editing, and lineage tracking | Human-in-the-loop approvals, tool permissions, and ambient supervision |

<img src="https://raw.githubusercontent.com/manavsehgal/ainative/main/public/readme/home-below-fold.png" alt="ainative-business home workspace below fold — projects, activity feed, and signals" width="1200" />

---

## Why `ainative-business`

The AI agent stack is broken for business operators. You can spin up an agent in minutes — but running it reliably for real work means stitching together orchestration, governance, cost controls, and team coordination yourself. `ainative-business` closes that gap with a single local-first platform where agents do the work and you stay in control.

- **Local-first** — SQLite database, no cloud dependency, `npx ainative-business` and go
- **Multi-provider** — Claude Code + OpenAI Codex App Server behind one runtime registry
- **Your rules, enforced** — Tool permissions, inbox approvals, and audit trails for every agent action
- **Your AI team** — 21 specialist profiles ready to deploy, each with instructions, tool policies, and runtime tuning
- **Business processes, automated** — 6 workflow patterns (sequence, planner-executor, checkpoint, parallel, loop, swarm)
- **Know what you spend** — Usage metering, budgets, and spend visibility per provider and model

---

## About Author

<!-- ABOUT:BEGIN source=https://ainative.business/about/ -->

### Manav Sehgal

Solutions Leader, AWS Frontier AI.

Author, AI Native Business open book. 2M+ Kaggle views. Ex Amazon AGI.

#### A personal research project

`ainative-business` & AI Native Business — Free and open source. Building AI Native Business over weekends, using personal laptop and capped AI plans.

#### Executive Credentials

- Harvard — Disruptive Strategy
- MIT Sloan — Design Thinking
- Berkeley Haas — Leading Innovative Change

#### Short version

> "`ainative-business` is a personal research project exploring what it takes to build AI-native on a shoestring budget over weekends." The AI Native Business open book serves as its 14-chapter playbook expanding this research.

### Bio

Manav is a solutions leader at AWS Frontier AI, collaborating with Anthropic, NVIDIA, and Disney on production AI and agentic systems. His 25-year arc spans Xerox PARC (1996), HCL's digital practice, Daily Mail, Amazon AGI, and AWS, where he has delivered scale AI programs for Amazon Retail and Alexa. He led AWS pandemic response which was honored by President of India award for the customer. He holds credentials from Harvard, MIT Sloan, Berkeley Haas. He has studied Computer Engineering and Lean Management.

### Research Premise

"`ainative-business` is a personal research project exploring what an AI-native operating system looks like." The AI Native Business book is its 14-chapter playbook for building autonomous business systems with AI agents.

### Attribution

`ainative-business` and AI Native Business are personal works of Manav Sehgal created in own personal time and resources. While they may refer to AWS technologies which enable the AI Native promise, the opinions expressed in the website are author's personal opinions and not that of the employer.

### Previously published

- Data Science Solutions (2017)
- React Speed Coding (2015)

<!-- ABOUT:END -->

---

## Runtime Bridge

Run the same business process on different AI providers without changing a line of configuration. `ainative-business`'s shared runtime registry routes tasks, schedules, and workflow steps through **Claude Code** (Anthropic Claude Agent SDK) and **OpenAI Codex App Server**, landing everything in the same inbox, monitoring, and cost surfaces. Switching providers is a settings change, not a rewrite.

---

## Feature Highlights

| | Feature | What it does |
|---|---------|-------------|
| 🏠 | **[Home Workspace](#home-workspace)** | Workspace briefing with active work, pending review, project signals, and live activity |
| 📌 | **[Task Execution](#task-execution)** | Status-driven execution board for planned, queued, running, completed, and failed work |
| 📁 | **[Projects](#projects)** | Portfolio-level organization with scoped context and working directories |
| 🔀 | **[Workflows](#workflows)** | Multi-step orchestration with sequence, planner-executor, and checkpoint patterns |
| 🧩 | **[Workflow Blueprints](#workflow-blueprints)** | Reusable templates for spinning up common automations quickly |
| 🧠 | **[Agent Profiles](#agent-profiles)** | Reusable specialist definitions with prompts, tool policy, and runtime tuning |
| ⏰ | **[Schedules](#schedules)** | Recurring and one-shot automations with cadence, expiry, and firing controls |
| 📄 | **[Documents](#document-management)** | Upload, preprocess, inspect, and link files to tasks and projects |
| 📊 | **[Tables](#tables)** | Airtable-like structured data with spreadsheet editing, charts, triggers, and agent tools |
| 📥 | **[Human-in-the-Loop Inbox](#inbox--human-in-the-loop)** | Approve tool use, answer questions, and review results from one queue |
| 💬 | **[Chat](#chat)** | Tool catalog with model selection, @ mentions, slash commands, and browser automation |
| 👀 | **[Monitoring](#monitoring)** | Live runtime visibility with log streaming, filters, and health signals |
| 🔁 | **[Provider Runtimes](#provider-runtimes)** | Shared runtime layer with Claude Code and OpenAI Codex App Server adapters |
| 🧪 | **[Parallel + Swarm Workflows](#parallel--swarm-workflows)** | Bounded fork/join and swarm orchestration without a free-form graph editor |
| 💸 | **[Cost & Usage](#cost--usage)** | Provider-aware metering, budgets, and spend visibility for governed runs |
| 🚨 | **[Ambient Approvals](#ambient-approvals)** | Shell-level approval prompts that keep Inbox as the durable supervision queue |
| 🔒 | **[Tool Permissions](#tool-permission-persistence)** | Trusted-tool policies with explicit "Always Allow" rules |
| 📋 | **[Kanban Board](#kanban-board-operations)** | Inline editing, bulk operations, and persistent board state |
| 🤖 | **[AI Assist → Workflows](#ai-assist--workflow-creation)** | Bridge task assist recommendations into governed workflow execution |
| 🧬 | **[Agent Self-Improvement](#agent-self-improvement)** | Agents learn patterns from execution history with human-approved context evolution |
| 🎯 | **[Tool Permission Presets](#tool-permission-presets)** | Pre-configured permission bundles (read-only, git-safe, full-auto) with layered apply/remove |
| 📦 | **[Workflow Context Batching](#workflow-context-batching)** | Workflow-scoped proposal buffering with batch approve/reject for learned context |
| 🧪 | **[E2E Test Automation](#e2e-test-automation)** | API-level end-to-end test suite covering both runtimes, 4 profiles, and 4 workflow patterns |
| ⌨️ | **[Command Palette](#command-palette)** | Global `⌘K` search for fast navigation across tasks, projects, workflows, and settings |
| 🧱 | **[Skill Composition](#skill-composition)** | Activate up to 3 skills at once with conflict detection and runtime-aware capability gates |
| 🔎 | **[Filters & Saved Searches](#filters--saved-searches)** | `#key:value` filter grammar, pinned and saved searches surfaced in `⌘K` palette |
| 🛡️ | **[Upgrade Detection](#upgrade-detection)** | Hourly upstream check with in-app notifications and guided merge sessions |
| 📖 | **[Playbook](#playbook)** | Built-in documentation with usage-stage awareness, adoption heatmap, and guided learning journeys |
| 📚 | **[Living Book](#living-book)** | AI-native book reader with 9 chapters, agent-powered regeneration, staleness detection, and reading paths |
| 🌐 | **[Environment](#environment)** | Control plane for Claude Code and Codex CLI environments with scanning, caching, sync, and templates |
| 🔧 | **[Browser Tools](#browser-tools)** | Chrome DevTools and Playwright MCP integration for browser automation in chat and task execution |

---

## Architecture

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/manavsehgal/ainative/main/public/readme/architecture-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/manavsehgal/ainative/main/public/readme/architecture-light.svg">
  <img src="https://raw.githubusercontent.com/manavsehgal/ainative/main/public/readme/architecture-light.svg" alt="ainative-business architecture diagram" width="900" />
</picture>

**Key design decisions:**

- **Server Components for reads** — Pages query SQLite directly, no API layer for reads
- **Fire-and-forget execution** — `POST /api/tasks/{id}/execute` returns 202, agent runs async
- **Notification-as-queue** — The `notifications` table is the message bus for human-in-the-loop; agents poll it via `canUseTool`
- **SSE for streaming** — `/api/logs/stream` pushes agent logs to the browser in real time
- **Provider runtime abstraction** — Tasks, schedules, workflows, task assist, and health checks route through shared runtime adapters instead of provider-specific entry points
- **Reusable agent profiles** — Profiles define instructions, allowed tools, runtime tuning, and MCP configs for repeated use
- **Permission pre-check** — Saved "Always Allow" patterns bypass the notification loop for trusted tools
- **Learned context loop** — Pattern extraction → human approval → versioned context injection creates a supervised self-improvement cycle
- **Permission presets** — Layered preset bundles (read-only ⊂ git-safe ⊂ full-auto) that compose with individual "Always Allow" patterns

---

## Feature Deep Dives

### Core

#### Home Workspace
Workspace-level briefing with active work, pending review, failed items, project counts, and live agent activity. The home view is designed for daily triage before you drill into execution, inbox, or monitoring detail.

#### Task Execution
Status-driven execution board with five columns: Planned → Queued → Running → Completed → Failed. Filter across projects, create tasks inline, and open task detail to inspect status, description, and runtime state without leaving the board.

<img src="https://raw.githubusercontent.com/manavsehgal/ainative/main/public/readme/tasks-list.png" alt="ainative-business tasks kanban board" width="1200" />

| Below the Fold |
|:-:|
| <img src="https://raw.githubusercontent.com/manavsehgal/ainative/main/public/readme/tasks-below-fold.png" alt="Tasks kanban board scrolled below the fold" width="580" /> |

#### Projects
Create and organize projects as containers for related tasks. Each project can specify a working directory — agent tasks resolve `cwd` from the project's path, enabling agents to operate on external codebases. Server-rendered project cards with task counts, status badges, and a detail view at `/projects/[id]`.

| Project Cards | Project Detail |
|:-:|:-:|
| <img src="https://raw.githubusercontent.com/manavsehgal/ainative/main/public/readme/projects-list.png" alt="Project cards overview" width="580" /> | <img src="https://raw.githubusercontent.com/manavsehgal/ainative/main/public/readme/projects-detail.png" alt="Project detail view" width="580" /> |

### Agent

#### Provider Runtimes
`ainative-business` supports two governed execution runtimes behind a shared runtime registry:
- **Claude Code** via the Anthropic Claude Agent SDK
- **OpenAI Codex App Server** via `codex app-server`

Tasks, schedules, and workflow steps can target a runtime explicitly, while settings exposes runtime-specific authentication and health checks. Runtime-specific execution still lands in the same inbox, monitoring, and task state surfaces.

#### Agent Integration
Claude Agent SDK integration with the `canUseTool` polling pattern remains the default Claude execution path. Tasks are dispatched fire-and-forget and run asynchronously, while every tool call, reasoning step, and decision is surfaced through inbox approvals and monitor logs.

#### OpenAI Codex Runtime
OpenAI Codex App Server is integrated as `ainative-business`'s second governed runtime. Codex-backed tasks preserve project working directories, document context, resumable thread IDs, inbox approval requests, user questions, and provider-labeled logs. The same runtime can also power task assist, scheduled firings, and workflow child tasks.

#### Agent Profiles
Profile-backed execution with specialist definitions for different job types. Each profile packages instructions, allowed tools, max turns, and output format so teams can reuse behavior intentionally instead of relying on ad hoc prompts. Profile cards display role-based icon circles with keyword-inferred colors (blue for work, purple for personal), alongside domain tags, runtime badges, and tool counts. Workflow steps and schedules can reference profiles directly, and runtimes can be selected independently when provider support differs.

<img src="https://raw.githubusercontent.com/manavsehgal/ainative/main/public/readme/profiles-list.png" alt="ainative-business agent profiles with role-based icon circles" width="1200" />

#### Workflows
Multi-step task orchestration with six patterns:
- **Sequence** — Steps execute in order
- **Planner→Executor** — One agent plans, another executes each step
- **Human-in-the-Loop Checkpoint** — Pauses for human approval between steps
- **Parallel** — Concurrent branch execution with fork/join synthesis
- **Loop** — Iterative agent execution with configurable stop conditions
- **Swarm** — Mayor/workers/refinery multi-agent orchestration

State machine engine with step-level retry, project association, and real-time status visualization.

#### Parallel + Swarm Workflows
`ainative-business` supports two bounded expansion patterns on top of the workflow engine:
- **Parallel research fork/join** — 2-5 concurrent branches followed by one synthesis step
- **Swarm orchestration** — mayor → worker pool → refinery with retryable stages and configurable worker concurrency

Both patterns preserve the same governed task model, runtime selection, monitoring stream, and workflow detail surface instead of introducing a separate orchestration product.

#### AI Task Assist
AI-powered task creation: generate improved descriptions, break tasks into sub-tasks, recommend workflow patterns, and estimate complexity through the shared runtime task-assist layer. Claude and OpenAI task assist now both route through the provider runtime abstraction.

#### AI Assist → Workflow Creation
Bridge from AI task assist to workflow engine: when task assist recommends a multi-step plan, a "Create as Workflow" button converts the recommendation into a validated workflow definition with per-step profile assignments, dependency ordering, and pattern selection across all six workflow types. The `WorkflowConfirmationSheet` lets operators review and edit steps, profiles, and configuration before creating the workflow. A keyword-based profile suggestion fallback ensures steps get reasonable profile assignments even without the AI classifier.

#### Agent Self-Improvement
Agents learn from execution history through a human-approved instruction evolution loop. After each task completion, the pattern extractor analyzes logs and proposes context updates — concise behavioral rules the agent should follow in future runs. Operators approve, reject, or edit proposals before they take effect. Learned context is versioned with rollback support and size-limited summarization to prevent unbounded growth. A sweep agent can audit the codebase for improvement opportunities and create prioritized tasks from its findings.

#### Workflow Context Batching
During workflow execution, the pattern extractor buffers context proposals into a learning session instead of creating individual notifications per proposal. When the workflow completes, all proposals are surfaced as a single batch for review. Operators can approve all, reject all, or review individually — reducing notification noise from multi-step workflows while preserving human oversight. The batch review component integrates into the existing pending approval host.

#### Session Management
Resume failed or cancelled agent tasks with one click. Tracks retry counts (limit: 3), detects expired sessions, and provides atomic claim to prevent duplicate runs.

#### Autonomous Loop Execution
Iterative agent loop pattern with four stop conditions: max iterations, time budget, human cancel, and agent-signaled completion. Each iteration creates a child task with previous output as context. Loop status view with iteration timeline, progress bar, and expandable results. Pause/resume via DB status polling.

#### Agent Profile Catalog
Curated agent profiles across work and personal domains, built as portable Claude Code skill directories with `profile.yaml` sidecars. The profile gallery displays role-based icon circles with keyword-inferred colors and supports domain filtering and search, while YAML customization, GitHub import, and behavioral smoke tests keep profile behavior inspectable and reusable.

#### Workflow Blueprints
Pre-configured workflow templates across work and personal domains. Browse blueprints in a gallery with pattern-colored icon circles, domain tags, and difficulty badges. Preview steps and required variables, fill in a dynamic form, and create draft workflows with resolved prompts and profile assignments. Create custom blueprints via YAML or import from GitHub URLs. Lineage tracking connects workflows back to their source blueprint.

<img src="https://raw.githubusercontent.com/manavsehgal/ainative/main/public/readme/workflows-list.png" alt="ainative-business workflows with keyword-inferred icon circles" width="1200" />

| Workflow Detail |
|:-:|
| <img src="https://raw.githubusercontent.com/manavsehgal/ainative/main/public/readme/workflows-detail.png" alt="Workflow detail with steps and status" width="580" /> |

### Documents

#### Document Management
Full document browser at `/documents` with table and grid views. Upload files with drag-and-drop, preview images/PDFs/markdown/code inline, search by filename and extracted text, and filter by processing status or project. Bulk delete, link/unlink to projects and tasks.

| Table View | Grid View |
|:-:|:-:|
| <img src="https://raw.githubusercontent.com/manavsehgal/ainative/main/public/readme/documents-list.png" alt="Documents table view" width="580" /> | <img src="https://raw.githubusercontent.com/manavsehgal/ainative/main/public/readme/documents-grid.png" alt="Documents grid view" width="580" /> |

#### Document Preprocessing
Automatic text extraction on upload for five file types: text, PDF (pdf-parse), images (image-size), Office documents (mammoth/jszip), and spreadsheets (xlsx). Extracted text, processed paths, and processing errors are tracked per document.

#### Agent Document Context
Documents linked to a task are automatically injected into the agent's prompt as context. The context builder aggregates extracted text from all linked documents, giving agents access to uploaded reference material without manual copy-paste.

#### Tables
Airtable-like structured data system at `/tables` with 14 features. Create tables from scratch, import from CSV/XLSX documents, or use one of 12 built-in templates across 5 categories. Each table includes an inline spreadsheet editor with keyboard navigation, type-aware cell renderers, computed columns with formula support (12 functions including sum, avg, if, daysBetween), and optimistic saves.

| Table List | Spreadsheet Editor |
|:-:|:-:|
| <img src="https://raw.githubusercontent.com/manavsehgal/ainative/main/public/readme/tables-list.png" alt="Tables list view" width="580" /> | <img src="https://raw.githubusercontent.com/manavsehgal/ainative/main/public/readme/tables-detail.png" alt="Table spreadsheet editor" width="580" /> |

| Charts | Template Gallery |
|:-:|:-:|
| <img src="https://raw.githubusercontent.com/manavsehgal/ainative/main/public/readme/tables-detail-charts.png" alt="Table charts tab" width="580" /> | <img src="https://raw.githubusercontent.com/manavsehgal/ainative/main/public/readme/tables-templates.png" alt="Table template gallery" width="580" /> |

- **Charts** — Bar, line, pie, and scatter charts with configurable X/Y axes and aggregation
- **Workflow triggers** — Automated actions fired when row data matches conditions
- **12 agent tools** — Agents can list, query, aggregate, search, add/update/delete rows, and create tables
- **Cross-table relations** — Link rows across tables with searchable relation combobox
- **Export** — CSV, XLSX, and JSON export for any table
- **Row versioning** — History tab with snapshot-before-mutation and rollback to previous versions
- **Idempotent inserts** — agent-driven row adds are deduped via canonical SHA-256 hash + partial unique index, so re-reads inside a tool call don't silently insert duplicates

### Knowledge

#### Playbook
Built-in documentation system at `/playbook` with usage-stage awareness that adapts content to your experience level (new, early, active, power user). Browse feature reference docs and guided learning journeys organized by persona (Personal, Work, Power User, Developer). Adoption heatmap tracks which features you've explored, while journey cards show progress through multi-step learning paths. Markdown rendering with automatic internal link resolution, table of contents, related docs, and screengrab embedding.

<img src="https://raw.githubusercontent.com/manavsehgal/ainative/main/public/readme/user-guide-list.png" alt="ainative-business playbook documentation" width="1200" />

#### Living Book
AI-native book reader at `/book` with 9 chapters across 3 parts (Foundation, Intelligence, Autonomy). Each chapter is generated from `ainative-business`'s own source code and feature docs by the document-writer agent — making this a book that writes itself.

- **Chapter regeneration** — one-click regeneration via the document-writer agent profile with fire-and-forget task execution
- **Staleness detection** — git-based change tracking compares source file timestamps against `lastGeneratedBy` frontmatter to show when chapters need updating
- **Live progress streaming** — SSE subscription shows real-time agent steps during generation (Reading files → Planning → Composing → Writing) with fade-in animation
- **Reading paths** — 4 persona-based paths (Getting Started, Team Lead, Power User, Developer) filter chapter navigation
- **Try It Now** — each chapter links to related Playbook feature docs and user journeys
- **Author's Notes** — collapsible callout blocks with behind-the-scenes commentary

### Environment

#### Environment
`ainative-business` doubles as a **control plane for AI coding environments** — scanning, caching, and syncing configuration for Claude Code and Codex CLI across projects. The environment dashboard surfaces detected tools, active configurations, git checkpoint status, and health scores.

- **Environment Scanner** — detects Claude Code and Codex CLI configurations, MCP servers, skills, and project settings
- **Environment Cache** — persists scanned state for fast dashboard rendering without re-scanning
- **Environment Dashboard** — unified view of all detected environments with health indicators
- **Git Checkpoint Manager** — tracks environment state via git commits for rollback and comparison
- **Environment Sync Engine** — bidirectional sync between local config and cached state
- **Project Onboarding** — guided flow for setting up new projects with environment-aware defaults
- **Environment Templates** — reusable environment configurations for common project types
- **Cross-Project Comparison** — compare environment settings across projects
- **Skill Portfolio** — aggregate view of skills across all detected environments
- **Environment Health Scoring** — composite health score based on configuration completeness and freshness
- **Agent Profile from Environment** — auto-generate agent profiles from detected environment capabilities

<img src="https://raw.githubusercontent.com/manavsehgal/ainative/main/public/readme/environment-list.png" alt="ainative-business environment dashboard" width="1200" />

#### Browser Tools
Enable browser automation in chat and task execution through two MCP integrations: **Chrome DevTools MCP** (29 tools for connecting to a running Chrome instance via CDP) and **Playwright MCP** (50+ tools for headless browser automation). Configure both from Settings with independent toggles and permission tiering — read-only operations auto-approve while mutations are gated through the inbox approval flow.

### Platform

#### Tool Permission Persistence
"Always Allow" option for agent tool permissions. When you approve a tool, you can save it as a pattern (e.g., `Bash(command:git *)`, `Read`, `mcp__server__tool`). Saved patterns are checked before creating notifications — trusted tools are auto-approved instantly. Manage patterns from the Settings page. `AskUserQuestion` always requires human input.

#### Ambient Approvals
Pending permission requests now surface through a shell-level approval presenter on any route, so operators can respond without leaving the page they are working on. Inbox remains the durable queue and source of truth, while the ambient surface provides the fast path for active supervision.

#### Tool Permission Presets
Pre-configured permission bundles that reduce friction for common tool approval patterns. Three layered presets — read-only (file reads, glob, grep), git-safe (adds git operations), and full-auto (adds write, edit, bash) — compose with existing "Always Allow" patterns. Presets are layered: enabling git-safe automatically includes read-only patterns; removing git-safe only strips its unique additions. Risk badges indicate the trust level of each preset. Manage presets from the Settings page alongside individual tool permissions.

#### Upgrade Detection
Hourly poller checks the upstream `origin/main` for new commits and surfaces them via an in-app `UpgradeBadge` + notification queue. If three consecutive checks fail, a single deduplicated "Upgrade check failing" notification is inserted (and cleared on the next successful tick). The `upgrade-assistant` profile drives guided merge sessions end-to-end — including free-form questions and 3-choice option cards when a merge conflict or drifted `main` requires operator input. Dev repos are fully gated via `AINATIVE_DEV_MODE` and a `.git/ainative-dev-mode` sentinel so contributor pushes are never blocked.

#### Schedules
Time-based scheduling for agent tasks with human-friendly intervals (`5m`, `2h`, `1d`) and raw 5-field cron expressions. One-shot and recurring modes with pause/resume lifecycle, expiry limits, and max firings. Each firing creates a child task through the shared execution pipeline, and schedules can now target a runtime explicitly. Scheduler runs as a poll-based engine started via Next.js instrumentation hook.

<img src="https://raw.githubusercontent.com/manavsehgal/ainative/main/public/readme/schedules-list.png" alt="ainative-business schedules" width="1200" />

#### Micro-Visualizations
Pure SVG chart primitives (Sparkline, MiniBar, DonutRing) with zero charting dependencies. Integrated into: homepage stats cards (7-day trends), activity feed (24h bar chart), project cards (completion donuts), monitor overview (success rate), and project detail (stacked status + 14-day sparkline). Full accessibility with `role="img"` and `aria-label`.

#### Cost & Usage
Provider-normalized metering tracks token and spend activity across tasks, resumes, workflow child tasks, schedules, task assist, and profile tests. The dedicated `Cost & Usage` surface adds summary cards, trend views, provider/model breakdowns, and budget-aware audit visibility on top of the usage ledger.

<img src="https://raw.githubusercontent.com/manavsehgal/ainative/main/public/readme/costs-list.png" alt="ainative-business cost and usage dashboard" width="1200" />

### UI & DevEx

#### Inbox & Human-in-the-Loop
When an agent needs approval or input, a notification appears in your inbox. Review tool permission requests with "Allow Once" / "Always Allow" / "Deny" buttons, answer agent questions, and see task completion summaries. Supports bulk dismiss and 10s polling.

<img src="https://raw.githubusercontent.com/manavsehgal/ainative/main/public/readme/inbox-list.png" alt="ainative-business inbox approval flow" width="1200" />

| Expanded Notification |
|:-:|
| <img src="https://raw.githubusercontent.com/manavsehgal/ainative/main/public/readme/inbox-expanded.png" alt="Inbox notification expanded" width="580" /> |

#### Chat
Conversational control plane for all workspace primitives — projects, tasks, workflows, documents, and profiles are all reachable from the chat surface. The chat interface is organized as a **tool catalog** with five categories (Explore, Create, Debug, Automate, Smart Picks) that help discover workspace capabilities. Progressive 5-tier context injection (~53K token budget) builds workspace awareness from lightweight summaries up to full document content. **@ mentions** let you reference documents and entities directly in prompts with fuzzy search autocomplete, injecting their content as context. **Slash commands** (`/`) provide quick access to tools and actions. Multi-provider model selection with cost tiers ($, $$, $$$) spans Claude Haiku through Opus and GPT-5.x models. Browser automation via Chrome DevTools and Playwright MCP enables screenshot capture and web interaction from chat. Quick Access navigation pills in responses provide entity deep-linking. `ainative-business` CRUD tools let you create, update, and delete workspace entities through natural language.

<img src="https://raw.githubusercontent.com/manavsehgal/ainative/main/public/readme/chat-conversation.png" alt="ainative-business chat conversation with @ document context" width="1200" />

| Tool Catalog | Skill Composition | @ Mentions |
|:-:|:-:|:-:|
| <img src="https://raw.githubusercontent.com/manavsehgal/ainative/main/public/readme/chat-list.png" alt="Chat tool catalog with category tabs" width="380" /> | <img src="https://raw.githubusercontent.com/manavsehgal/ainative/main/public/readme/chat-skills-tab.png" alt="Chat Skills tab — activate up to 3 skills with conflict detection" width="380" /> | <img src="https://raw.githubusercontent.com/manavsehgal/ainative/main/public/readme/chat-mentions-popover.png" alt="Chat @ mentions popover for documents and entities" width="380" /> |

#### Skill Composition
Activate up to three skills in a single conversation with conflict detection and runtime-aware capability gates. The Skills tab in the chat popover surfaces `+ Add` buttons on inactive skills, active badges with deactivate actions, and an "N of M active" indicator. When two skills issue polarity-divergent directives on shared keywords, a conflict dialog previews the excerpts and lets you confirm with `force:true` or back out. Composition honors the runtime capability matrix — Claude Code and Codex App Server support up to 3 active skills, while Ollama stays at 1. Conversations persist active skills through an additive `active_skill_ids` column that preserves legacy single-skill reads.

#### Filters & Saved Searches
Structured `#key:value` filter grammar across chat, documents, and the `⌘K` palette. The shared `FilterInput` parser accepts bare clauses, quoted values (`#tag:"needs review"`), and free text — clauses AND with surface-specific Select filters and sync to URL params for shareable, refresh-persistent views. Save any filter expression with a rename footer; saved searches appear as a dedicated group in the mention popover and in the command palette, so views built in one surface are reachable from anywhere. Pinned saved searches sit at the top of both lists for zero-click recall.

#### Monitoring
Real-time agent log streaming via Server-Sent Events. Filter by task or event type, click entries to jump to task details, and auto-pause polling when the tab is hidden (Page Visibility API).

<img src="https://raw.githubusercontent.com/manavsehgal/ainative/main/public/readme/monitor-list.png" alt="ainative-business monitoring dashboard" width="1200" />

#### Content Handling
File upload with drag-and-drop in task creation. Type-aware content preview for text, markdown (via react-markdown), code, and JSON. Copy-to-clipboard and download-as-file for task outputs.

#### Settings
Configuration hub with provider-aware sections: Claude authentication (API key or OAuth), OpenAI Codex runtime API-key management, chat defaults (model selection), **browser tools** (Chrome DevTools and Playwright MCP toggles), runtime configuration (SDK timeout and max turns), tool permissions (saved "Always Allow" patterns with revoke), permission presets, budget guardrails, **database snapshots** (automatic backups with configurable retention and one-click restore), and data management.

<img src="https://raw.githubusercontent.com/manavsehgal/ainative/main/public/readme/settings-list.png" alt="ainative-business settings" width="1200" />

| Browser Tools | Permission Presets | Budget Configuration |
|:-:|:-:|:-:|
| <img src="https://raw.githubusercontent.com/manavsehgal/ainative/main/public/readme/settings-browser-tools.png" alt="Browser tools MCP toggles" width="380" /> | <img src="https://raw.githubusercontent.com/manavsehgal/ainative/main/public/readme/settings-presets.png" alt="Tool permission presets" width="380" /> | <img src="https://raw.githubusercontent.com/manavsehgal/ainative/main/public/readme/settings-budget.png" alt="Budget configuration" width="380" /> |

#### CLI
The `npx ainative-business` entry point boots a Next.js server from the published npm package. It is built from `bin/cli.ts` into `dist/cli.js` using tsup, and serves as the primary distribution channel — no clone required.

#### Database
SQLite with WAL mode via better-sqlite3 + Drizzle ORM. <!-- STAT:dbTables -->45<!-- /STAT --> tables including core tables: `projects`, `tasks`, `workflows`, `agent_logs`, `notifications`, `documents`, `schedules`, `settings`, `learned_context`, `usage_ledger`, `conversations`, `chat_messages`, `environments`, `environment_configs`. Self-healing bootstrap — tables are created on startup if missing.

#### Command Palette
Global `⌘K` command palette for fast navigation and search across tasks, projects, workflows, and settings. Recent items, fuzzy search, and keyboard-driven navigation.

| Empty Palette | Search Results |
|:-:|:-:|
| <img src="https://raw.githubusercontent.com/manavsehgal/ainative/main/public/readme/command-palette-empty.png" alt="Command palette empty state" width="580" /> | <img src="https://raw.githubusercontent.com/manavsehgal/ainative/main/public/readme/command-palette-search.png" alt="Command palette search results" width="580" /> |

#### App Shell
Responsive sidebar with collapsible icon-only mode, custom ainative logo, tooltip navigation, dark/light/system theme, and OKLCH hue 250 blue-indigo color palette. Built on shadcn/ui (New York style) with PWA manifest and app icons. Routes: Home, Dashboard, Inbox, Chat, Projects, Workflows, Documents, Monitor, Profiles, Schedules, Cost & Usage, AI Native Business, User Guide, Environment, Settings.

#### E2E Test Automation
API-level end-to-end test suite built on Vitest with 120-second timeouts and sequential execution. Five test files cover single-task execution, sequence workflows, parallel workflows, blueprints, and cross-runtime scenarios across both Claude and Codex backends. Tests skip gracefully when runtimes are not configured, preventing CI failures. Run with `npm run test:e2e`.

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Framework | Next.js 16 + React 19 | Server Components for zero-API reads, Turbopack for fast dev |
| Language | TypeScript (strict) | End-to-end type safety from DB schema to UI |
| Styling | Tailwind CSS v4 + shadcn/ui | Utility-first CSS with accessible component primitives |
| Database | SQLite (WAL) + Drizzle ORM | Zero-config embedded DB, type-safe queries, concurrent reads |
| AI Runtime | `@anthropic-ai/claude-agent-sdk` + `codex app-server` | Governed Claude and OpenAI execution behind a shared runtime layer |
| CLI | Commander + tsup | Familiar CLI framework, fast ESM bundling |
| Testing | Vitest + Testing Library | Fast test runner with React component testing |
| Content | react-markdown + remark-gfm | Full GitHub-flavored markdown rendering |
| Validation | Zod v4 | Runtime type validation at system boundaries |
| Documents | pdf-parse, mammoth, xlsx, image-size | Multi-format document preprocessing |
| Scheduling | cron-parser | Cron expression parsing and next-fire-time computation |

---

## Development

```bash
npm run dev            # Next.js dev server (Turbopack)
npm run build:cli      # Build CLI → dist/cli.js
npm test               # Run Vitest
npm run test:coverage  # Coverage report
npm run test:e2e       # E2E integration tests (requires runtime credentials)
```

### Project Structure

```
docs/                     # Playbook markdown docs + manifest.json
src/
├── app/                  # Next.js App Router pages
│   ├── dashboard/        # Task kanban board
│   ├── projects/[id]/    # Project detail
│   ├── tasks/            # Task detail + creation (redirects to dashboard)
│   ├── profiles/         # Agent profile gallery + detail + creation
│   ├── documents/        # Document browser
│   ├── workflows/        # Workflow management + blueprints
│   ├── schedules/        # Schedule management
│   ├── costs/            # Cost & usage dashboard
│   ├── playbook/         # Documentation & learning journeys
│   ├── chat/             # Conversational AI (tool catalog)
│   ├── book/             # AI Native Book reader
│   ├── environment/      # Environment control plane
│   ├── inbox/            # Notifications
│   ├── monitor/          # Log streaming
│   └── settings/         # Configuration
├── components/
│   ├── dashboard/        # Homepage widgets + charts
│   ├── tasks/            # Board, cards, panels
│   ├── profiles/         # Profile gallery, detail, form, learned context
│   ├── workflows/        # Workflow UI + blueprints + swarm
│   ├── documents/        # Document browser + upload
│   ├── costs/            # Cost dashboard + filters
│   ├── playbook/         # Playbook docs + journeys + adoption
│   ├── schedules/        # Schedule management
│   ├── monitoring/       # Log viewer
│   ├── chat/             # Chat shell, messages, input composer, tool catalog
│   ├── book/             # Book reader, chapters, reading paths
│   ├── environment/      # Environment dashboard, scanner, templates
│   ├── notifications/    # Inbox + permission actions
│   ├── settings/         # Auth, permissions, budgets, browser tools, data mgmt
│   ├── shared/           # App shell, sidebar
│   └── ui/               # shadcn/ui primitives
└── lib/
    ├── agents/           # Runtime adapters, profiles, learned context, pattern extraction
    ├── db/               # Schema, migrations
    ├── docs/             # Playbook reader, adoption, usage-stage, journey tracker
    ├── documents/        # Preprocessing + context builder
    ├── workflows/        # Engine + types + blueprints
    ├── schedules/        # Scheduler engine + interval parser
    ├── settings/         # Auth, permissions, helpers
    ├── chat/             # Chat engine, context builder, model discovery
    ├── usage/            # Metering ledger + pricing registry
    ├── constants/        # Status transitions, colors
    ├── queries/          # Chart data aggregation
    ├── validators/       # Zod schemas
    └── utils/            # Shared helpers
```

### API Endpoints (160 routes)

| Domain | Endpoint | Method | Purpose |
|--------|----------|--------|---------|
| **Projects** | `/api/projects` | GET/POST | List and create projects |
| | `/api/projects/[id]` | GET/PUT/DELETE | Project CRUD |
| **Tasks** | `/api/tasks` | GET/POST | List and create tasks |
| | `/api/tasks/[id]` | GET/PATCH/DELETE | Task detail, update, delete |
| | `/api/tasks/[id]/execute` | POST | Fire-and-forget task dispatch (202) |
| | `/api/tasks/[id]/resume` | POST | Resume failed/cancelled task |
| | `/api/tasks/[id]/cancel` | POST | Cancel running task |
| | `/api/tasks/[id]/respond` | POST | Human response to agent prompt |
| | `/api/tasks/[id]/output` | GET | Task execution output |
| | `/api/tasks/[id]/logs` | GET | Task log history |
| | `/api/tasks/assist` | POST | AI task assist (description, subtasks, workflow recommendation) |
| **Workflows** | `/api/workflows` | GET/POST | List and create workflows |
| | `/api/workflows/[id]` | GET/PATCH/DELETE | Workflow detail, update, delete |
| | `/api/workflows/[id]/execute` | POST | Execute workflow |
| | `/api/workflows/[id]/status` | GET | Workflow execution status |
| | `/api/workflows/[id]/steps/[stepId]/retry` | POST | Retry failed workflow step |
| | `/api/workflows/from-assist` | POST | Create workflow from AI assist recommendation |
| **Blueprints** | `/api/blueprints` | GET/POST | List and create blueprints |
| | `/api/blueprints/[id]` | GET/DELETE | Blueprint detail and deletion |
| | `/api/blueprints/[id]/instantiate` | POST | Create workflow from blueprint |
| | `/api/blueprints/import` | POST | Import blueprint from GitHub URL |
| **Documents** | `/api/documents` | GET | List documents with joins |
| | `/api/documents/[id]` | GET/PATCH/DELETE | Document detail, metadata, deletion |
| | `/api/documents/[id]/file` | GET | Download document file |
| **Uploads** | `/api/uploads` | POST | File upload |
| | `/api/uploads/[id]` | GET/DELETE | Upload detail and deletion |
| | `/api/uploads/cleanup` | POST | Clean up orphaned uploads |
| **Profiles** | `/api/profiles` | GET | List agent profiles |
| | `/api/profiles/[id]` | GET/PUT/DELETE | Profile CRUD |
| | `/api/profiles/[id]/test` | POST | Run behavioral tests on a profile |
| | `/api/profiles/[id]/context` | GET/POST/PATCH | Learned context: version history, manual add, approve/reject/rollback |
| | `/api/profiles/import` | POST | Import profile from GitHub URL |
| **Notifications** | `/api/notifications` | GET/POST | List and create notifications |
| | `/api/notifications/[id]` | PATCH/DELETE | Update and delete notification |
| | `/api/notifications/mark-all-read` | POST | Mark all notifications as read |
| | `/api/notifications/pending-approvals` | GET | Pending approval notifications |
| | `/api/notifications/pending-approvals/stream` | GET | SSE stream for pending approvals |
| **Schedules** | `/api/schedules` | GET/POST | Schedule CRUD |
| | `/api/schedules/[id]` | GET/PATCH/DELETE | Schedule detail + updates |
| **Settings** | `/api/settings` | GET/POST | General settings |
| | `/api/settings/openai` | GET/POST | OpenAI Codex runtime settings |
| | `/api/settings/test` | POST | Provider-aware runtime connectivity test |
| | `/api/settings/budgets` | GET/POST | Budget configuration |
| | `/api/permissions` | GET/POST/DELETE | Tool permission patterns |
| | `/api/permissions/presets` | GET/POST/DELETE | Permission preset bundles |
| **Context** | `/api/context/batch` | POST | Batch approve/reject context proposals |
| **Monitoring** | `/api/logs/stream` | GET | SSE agent log stream |
| **Playbook** | `/api/playbook/status` | GET | Playbook adoption status and usage stage |
| **Chat** | `/api/chat/conversations` | GET/POST | List and create conversations |
| | `/api/chat/conversations/[id]` | GET/PATCH/DELETE | Conversation detail, update, delete |
| | `/api/chat/conversations/[id]/messages` | GET/POST | List messages and send new message (SSE streaming) |
| | `/api/chat/models` | GET | Available models with cost tiers |
| | `/api/chat/suggested-prompts` | GET | Context-aware suggested prompt categories |
| | `/api/chat/conversations/[id]/respond` | POST | Respond to permission or question prompt |
| **Platform** | `/api/command-palette/recent` | GET | Recent command palette items |
| | `/api/data/clear` | POST | Clear all data |
| | `/api/data/seed` | POST | Seed sample data |

---

## Roadmap

### MVP — Complete

All 14 features shipped across three layers:

| Layer | Features |
|-------|----------|
| **Foundation** | CLI bootstrap, database schema, app shell |
| **Core** | Project management, task board, agent integration, inbox notifications, monitoring dashboard |
| **Polish** | Homepage dashboard, UX fixes, workflow engine, AI task assist, content handling, session management |

### Post-MVP — 197 features shipped (211 total, including 14 MVP)

| Category | Features |
|----------|---------|
| **Documents** (5) | File attachments, preprocessing (5 formats), agent context injection, document browser, output generation |
| **Agent Intelligence** (6) | Multi-agent routing, autonomous loops, multi-agent swarm, AI assist→workflows, agent self-improvement, workflow context batching |
| **Agent Profiles** (2) | Agent profile catalog (<!-- STAT:builtinProfiles -->21<!-- /STAT --> profiles), workflow blueprints (<!-- STAT:workflowBlueprints -->15<!-- /STAT --> templates) |
| **UI Enhancement** (13) | Ambient approvals, learned context UX, micro-visualizations, command palette, operational surface, profile surface, accessibility, UI density, kanban operations, board persistence, detail view redesign, playbook documentation, workflow UX overhaul |
| **Platform** (8) | Scheduled prompt loops, tool permissions, provider runtimes, OpenAI Codex runtime, cross-provider profiles, parallel fork/join, tool permission presets, npm publish (deferred) |
| **Runtime Quality** (2) | SDK runtime hardening, E2E test automation |
| **Governance** (3) | Usage metering ledger, spend budget guardrails, cost & usage dashboard |
| **Chat** (12) | Chat data layer, chat engine (5-tier context, CRUD tools), API routes (SSE streaming), UI shell, message rendering (Quick Access pills), input composer (tool catalog, model selector), skill composition (multi-skill with conflict detection), filter namespace (`#key:value` grammar), pinned + saved searches, conversation templates, **conversation branching + rewind** (`⌘Z`/`⌘⇧Z`), **chat-driven app builder** |
| **Composed Apps** (10) | Apps surface (`/apps` route), starters showcase, kit-aware detail views, 6 layout kits (Tracker, Coach, Ledger, Inbox, Research, Workflow Hub), manifest authoring tools (`set_app_view_kit`/`bindings`/`kpis`), atomic manifest writes, KPI ratio composition (`kind: ratio` over leaf sources for averages / percentages / win-rates) |
| **Onboarding** (2) | First-launch runtime preference modal (Best quality / Balanced / Lowest cost / Best privacy), instance bootstrap with dev-mode gate |
| **Plugin Platform** (5) | M3 chat-tools plugin kind, MCP plugin spec, plugin tools registry, plugin spec tools, schedule spec tools |
| **Platform Hardening** (2) | Runtime validation hardening (MCP-tool runtime-id validation with safe fallbacks), upgrade detection (hourly upstream poll + guided merge sessions) |
| **Environment** (11) | Environment scanner, cache, dashboard, git checkpoint manager, sync engine, project onboarding, templates, cross-project comparison, skill portfolio, health scoring, agent profile from environment |
| **Living Book** (5) | Content merge (chapters → playbook), author's notes, reading paths, markdown pipeline, self-updating chapters |

The category list above is illustrative — see `features/roadmap.md` for the full feature inventory and `features/stats/snapshot.json` for the canonical counts.

### Planned

| Feature | Priority | Description |
|---------|----------|-------------|
| Browser Use | P1 | Chrome DevTools + Playwright MCP integration for browser automation |
| Workspace Context Awareness | P1 | Surface cwd, git branch, worktree status to chat agents |
| Chat Command Mentions | P1 | Slash commands for tools/actions + @ entity mentions |
| Task Hierarchy Clarity | P1 | Distinguish standalone vs workflow-bound tasks |
| Chat Conversation Persistence | P1 | URL/localStorage persistence for active conversations |
| Settings Interactive Controls | P2 | Slider upgrades for SDK Timeout and Max Turns |
| Agent Document API Access | P2 | MCP-based document tools for agent consumption |

---

## Contributing

### Contributor Setup

```bash
git clone https://github.com/manavsehgal/ainative.git && cd ainative && npm install

# Set up one or both runtime credentials
cat > .env.local <<'EOF'
ANTHROPIC_API_KEY=your-anthropic-key
OPENAI_API_KEY=your-openai-key
EOF

# Start the dev server
npm run dev
```

### Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Make your changes and add tests
4. Run `npm test` and `npx tsc --noEmit`
5. Submit a pull request

See `AGENTS.md` for architecture details and development conventions.

---

## License

Licensed under the [Apache License 2.0](LICENSE).

Copyright 2025-2026 [Manav Sehgal](https://github.com/manavsehgal)
