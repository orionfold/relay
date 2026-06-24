---
title: "Personal Use Guide"
category: "user-journey"
persona: "personal"
difficulty: "beginner"
estimatedTime: "30 minutes"
sections: ["home-workspace", "dashboard-kanban", "projects", "chat", "tables", "schedules", "user-guide"]
tags: ["beginner", "solo", "tasks", "kanban", "chat", "tables", "schedules", "delivery-channels"]
lastUpdated: "2026-04-16"
---

# Personal Use Guide

Meet Alex, a solo founder who just discovered `ainative-business`. Alex has a side project -- a personal portfolio website -- that needs planning and execution help, but has never used an AI business operating system before. Over the next 30 minutes, Alex will explore the platform, chat with AI, create a project, manage tasks on a kanban board, set up a heartbeat schedule, and discover delivery channels for Telegram notifications. By the end, Alex will have a fully organized project with proactive AI monitoring.

## Prerequisites

- `ainative-business` installed and running locally (`npm run dev`)
- A browser pointed at `http://localhost:3000`
- A project idea in mind (we will use a "Portfolio Website" as our example)

## Journey Steps

### Step 1: First Launch and the Home Page

Alex opens `ainative-business` for the first time. Before the home page renders, a one-time modal appears asking how Alex wants to balance quality, speed, cost, and privacy when running agents.

![First-launch runtime preference modal with four radio options](../screengrabs/onboarding-runtime-modal.png)

1. Read the four options:
   - **Best quality** — Claude Opus (highest accuracy, highest cost)
   - **Balanced** — Claude Sonnet (default; good price/quality)
   - **Lowest cost** — Claude Haiku (smallest, cheapest)
   - **Best privacy** — local Ollama model (runs entirely on your machine; requires Ollama installed)
2. Pick **Balanced** — Sonnet is a great default and you can change it later from Settings → Chat. The modal closes and your choice is saved.

![Settings → Chat showing the model preference subsection where the choice can be revisited](../screengrabs/settings-chat-model-preference.png)

The home page now greets Alex with a sidebar on the left showing every section of the workspace -- Home, Compose, Observe, Learn, and Configure groups -- and the main content area displays an activity overview with stat cards and a needs attention section.

![Home page with sidebar expanded showing navigation and activity overview](../screengrabs/home-list.png)

3. Open `ainative-business` at `http://localhost:3000` to land on the home page
4. Scan the **sidebar** on the left -- notice the five groups: Home (Dashboard, Tasks, Inbox, Chat), Compose (Projects, Workflows, Profiles, Schedules, Documents, Tables), Observe (Monitor, Cost & Usage, Analytics), Learn (AI Native Business, User Guide), and Configure (Environment, Settings)
5. Review the **stat cards** showing active tasks, completed today, awaiting review, active projects, and active workflows
6. Note the **needs attention** section that will surface items requiring your input as agents run

> **Tip:** The sidebar stays visible across every page. It is your primary way to move between sections. You can collapse it for more screen space by clicking the toggle at the top. The runtime preference can be changed any time from Settings → Chat; the model selector in chat itself also lets you override the default per-conversation.

### Step 2: Discover Below-the-Fold Content

Alex scrolls down the home page and discovers additional context -- recent projects, chart visualizations, and workspace signals.

![Home page scrolled down showing stats and recent activity](../screengrabs/home-below-fold.png)

1. Scroll down past the stat cards on the home page
2. Review the **recent projects** section and any chart visualizations
3. Use these metrics as a daily check-in point to understand what needs attention

> **Tip:** The home page is designed as a morning dashboard. Start each session here to get an instant summary of your workspace before diving into specific tasks.

### Step 3: Navigate with the Command Palette

Before diving deeper, Alex learns the fastest way to get around `ainative-business` -- the Command Palette.

![Command palette overlay showing search results](../screengrabs/command-palette-search.png)

1. Press **Cmd+K** (Mac) or **Ctrl+K** (Windows/Linux) to open the Command Palette
2. Start typing a keyword like "dashboard" or "projects" to filter results
3. Use **arrow keys** to highlight a result, then press **Enter** to navigate there
4. Press **Escape** to dismiss the palette without selecting anything

> **Tip:** The Command Palette searches across pages, projects, tasks, and workflows. Memorize Cmd+K -- you will use it constantly.

### Step 4: Ask AI a Quick Question via Chat

Before setting up a formal project, Alex tries the Chat feature to brainstorm ideas.

![Chat empty state with suggested prompt categories and conversation sidebar](../screengrabs/chat-list.png)

1. Click **Chat** in the sidebar under the **Home** group
2. Notice the **Tool Catalog** with a welcoming hero heading and suggested prompt categories (Explore, Create, Debug, Automate)
3. Browse the **Smart Picks** row for personalized suggestions
4. Type a question like "What pages should a developer portfolio website include?" and press Enter
5. Review the AI response -- notice how Chat keeps a clean conversation thread, deduplicating similar messages so the history stays readable
6. Try typing **@** in the composer to open the mentions popover -- you can reference tasks, projects, documents, profiles, and workflows inline to give the AI richer context
7. Next time, try **Start from template** on the empty-state hero (or type `/new-from-template` in the composer) to open a conversation pre-primed with a blueprint like "Research a topic" or "Draft a plan"

![@ mentions popover showing pinned entities, tasks, projects, and documents](../screengrabs/chat-mentions-popover.png)

> **Tip:** Chat is perfect for quick brainstorming sessions. You do not need to create a project first -- just ask a question. The conversation history stays in the sidebar so you can return to it later. Pin useful filter + search combinations as **saved searches** (available from the `⌘K` palette under the **Saved** group) so you can jump back to them later.

### Step 4b: Rewind a Turn or Branch the Conversation

Alex types a follow-up question and the AI heads in a direction that is not quite what Alex wanted. Instead of starting a new chat, Alex rewinds the last turn and tries a different phrasing.

![Branch action button hovering on a completed assistant message](../screengrabs/chat-branch-action-button.png)

1. Press **`⌘Z`** while focused on the chat composer to **rewind** the last user-assistant pair — the assistant turn collapses to a gray italic placeholder ("Rewound · assistant turn hidden from context") and the original user message reappears in the composer for editing
2. Edit the prompt to clarify what you actually want, then press **Enter** to send the new turn — the agent re-replies without the rewound exchange polluting context
3. Press **`⌘⇧Z`** to **redo** if you want the rewound pair back

![Rewound user-assistant pair shown as collapsed placeholders](../screengrabs/chat-message-rewound.png)

4. To **branch** instead of rewind (keep both versions), hover any completed assistant message and click the **Branch** action that appears
5. In the dialog, give the new conversation a name — the parent is preserved and a child conversation begins from this exact point with the same context up to here

![Branch creation dialog with default branch title](../screengrabs/chat-branch-create-dialog.png)

> **Tip:** Branching is great when you want to try a different direction without losing the original thread — for example, "what if I described this portfolio with a more formal tone?" The parent and child conversations both stay in the sidebar, and you can switch between them like any other conversation. Note: branching is gated on `AINATIVE_CHAT_BRANCHING=true` in `.env.local`; if the Branch action is not visible, the flag is off.

### Step 5: Create a New Project

Inspired by the chat brainstorm, Alex decides to formalize the portfolio idea into a project.

![Projects list view showing project cards](../screengrabs/projects-list.png)

1. Click **Projects** in the sidebar under the **Compose** group
2. Click the **Create Project** button in the top-right corner

![Create project dialog with empty form fields](../screengrabs/projects-create-form-empty.png)

3. Enter a **Project Name** such as "Portfolio Website"
4. Add a **Description**: "Personal developer portfolio with project showcase, blog, and contact form"
5. Optionally set a **Working Directory** (so agent tasks resolve their cwd here) and pick a **Status**

![Create project dialog with all fields filled](../screengrabs/projects-create-form-filled.png)

6. Click **Create** to save the project — it appears in the projects grid and a fresh project view opens

![Project detail view with tasks grouped under the project](../screengrabs/journey-project-tasks.png)

> **Tip:** Give your project a clear, descriptive name -- it will appear throughout the workspace whenever you filter tasks or assign work. The Working Directory field is optional but useful: if you set it, agent tasks for this project run with that path as their `cwd`.

### Step 6: Open the Dashboard Kanban Board

With a project created, Alex heads to Tasks to start organizing work.

![Tasks kanban board with task cards organized across status columns](../screengrabs/tasks-list.png)

1. Click **Tasks** in the sidebar under the **Home** group
2. Review the kanban board layout with columns like **Planned**, **In Progress**, **Completed**, and others
3. Notice the **view controls** in the header area -- the board view is selected by default

> **Tip:** The kanban board gives you a visual pipeline of your work. Each column represents a stage in the task lifecycle.

### Step 7: Switch to Table View

Alex discovers that the Dashboard supports multiple view modes.

![Dashboard table view with sortable columns and density options](../screengrabs/tasks-table.png)

1. Click the **Table** view toggle in the Dashboard header to switch from kanban to table layout
2. Review the columns: title, status, priority, project, and other metadata
3. Click any **column header** to sort tasks by that field

> **Tip:** Table view shines when you have many tasks and need to quickly sort or compare them. Both views show the same data.

### Step 8: Create a New Task

Alex creates the first task for the portfolio project.

![Create task dialog with empty form fields](../screengrabs/tasks-create-form-empty.png)

1. Click the **Create Task** button in the Dashboard header
2. Enter a **Title**: "Design hero section with intro and call-to-action"
3. Write a **Description** with detail about requirements
4. Assign the task to the **Portfolio Website** project
5. Set **Priority** to High and leave **Status** as Planned

![Create task dialog with all fields filled](../screengrabs/tasks-create-form-filled.png)

6. Open the **/** popover in the composer to browse available tools (create_task, execute_task, read_file) and entities -- these are the same capabilities the AI uses when running tasks
7. Click **Create** to add the task to the board

![Newly created task highlighted on the kanban board](../screengrabs/journey-task-created.png)

![/ popover Tools tab showing available runtime tools](../screengrabs/chat-tools-tab.png)

> **Tip:** Write task descriptions as if you are briefing a colleague. The more specific you are, the better the AI agent results will be.

### Step 9: Quick-Edit a Task from the Kanban Board

Alex uses the quick-edit dialog for a fast priority change.

![Task edit dialog opened from a kanban card](../screengrabs/tasks-card-edit.png)

1. Hover over a task card on the kanban board
2. Click the **edit icon** (pencil) that appears on the card
3. Change the **Priority** or update the title and description
4. Click **Save** to apply the changes

### Step 10: View Task Details

Alex clicks on a task card to open the full detail sheet.

![Task detail sheet sliding in from the right with description, status, and timestamps](../screengrabs/tasks-detail.png)

1. Click on any **task card** in the kanban board (not the edit icon -- the card itself)
2. The **detail sheet** slides in from the right side of the screen
3. Review the full **Description**, **Priority**, **Status**, **Project** assignment, and timestamps

![Task detail view showing turn-by-turn agent execution observability](../screengrabs/journey-task-detail.png)

4. Scan the **execution observability** panel to see turn-by-turn agent activity (tools used, time per turn, last update)
5. Press **Escape** or click outside the sheet to close it

### Step 11: Track Content in a Table

Alex wants to keep a structured list of portfolio pages, their status, and target launch dates. A table is perfect for this kind of lightweight tracking.

![Tables list view showing structured data tables](../screengrabs/tables-list.png)

1. Click **Tables** in the sidebar under the **Compose** group
2. Click **Create Table** and enter a name: "Portfolio Pages"
3. Add columns: **Page Name** (text), **Status** (select: Draft / In Progress / Done), **Target Date** (date)
4. Start adding rows directly in the inline spreadsheet editor -- type into cells just like a regular spreadsheet
5. Use the table to track which pages are done and which still need work

> **Tip:** Tables are great for any structured tracking that does not need a full project board. Content calendars, feature lists, contact directories -- anything you would put in a spreadsheet fits naturally here.

### Step 12: Set Up a Heartbeat Schedule

Alex wants `ainative-business` to proactively check on the portfolio project every morning. A heartbeat schedule evaluates conditions before deciding whether to act -- it only creates tasks when something meaningful needs attention.

![Schedules list showing active and paused schedules](../screengrabs/schedules-list.png)

1. Click **Schedules** in the sidebar under the **Compose** group
2. Click **Create Schedule** and select type **Heartbeat**
3. Enter a **Name**: "Morning Portfolio Check"
4. Set the interval using natural language: "weekdays at 8am"
5. Add checklist items: "Are there any stale tasks older than 3 days?" and "Are there completed tasks that need review?"
6. Assign the Portfolio Website project and click **Create**

> **Tip:** Heartbeat schedules are smarter than clock-driven ones -- they suppress no-op runs. If your portfolio project has no stale tasks, the heartbeat stays quiet and costs nothing.

### Step 13: Connect Telegram for Notifications

Alex wants to receive schedule results on the go. Setting up a Telegram delivery channel takes less than two minutes.

![Settings page showing Delivery Channels configuration](../screengrabs/settings-channels.png)

1. Open **Settings** from the sidebar under **Configure**
2. Scroll to the **Delivery Channels** section
3. Click **+ Add Channel** and select **Telegram**
4. Create a Telegram bot via @BotFather (send `/newbot`), copy the bot token
5. Get your Chat ID by messaging the bot and visiting the getUpdates URL
6. Enter the Bot Token and Chat ID, then click **Create Channel**
7. Click **Test** to verify -- you should see a test message in Telegram
8. Toggle **Chat** on to enable bidirectional mode -- now you can message `ainative-business` from Telegram

> **Tip:** With Chat mode enabled, you can ask `ainative-business` questions directly from Telegram. "What's the status of my portfolio project?" works just like the web chat.

### Step 14: Browse the User Guide

Alex discovers the built-in documentation hub.

![User Guide page with adoption tracker and journey cards](../screengrabs/user-guide-list.png)

1. Click **User Guide** in the sidebar under the **Learn** group
2. Browse the **feature adoption tracker** to see which areas you have explored
3. Check the **guided journeys** for your current skill level
4. Use the feature grid to discover areas you have not tried yet

### Step 15: Read the AI Native Business book

Alex wants deeper context on how `ainative-business` fits into the broader shift to AI-native work. The companion book — **AI Native Business** — is published online at [ainative.business/book](https://ainative.business/book).

1. Open [ainative.business/book](https://ainative.business/book) in your browser
2. Scan the table of contents — chapters are organised from foundational concepts (From Hierarchy to Intelligence) through advanced topics (Autonomous Organization, The Road Ahead)
3. Read the chapters that match your current focus — the blueprint and refinery chapters for newcomers; workflow orchestration, scheduled intelligence, and human-in-the-loop for practitioners; agent self-improvement, multi-agent swarms, and the governance layer for the road ahead

> **Tip:** The book treats every example project as a case study — when you see a workflow or schedule described in a chapter, try building the same thing in your own workspace to anchor the idea in muscle memory.

### Step 16: What's Next

Alex now has a solid foundation: a project, organized tasks on a kanban board, a heartbeat schedule for proactive monitoring, and Telegram notifications for staying connected on the go. Here is where to go from here:

- **[Work Use Guide](./work-use.md)** -- Scale up to team projects with documents, workflows, and multi-channel notifications
- **[Power User Guide](./power-user.md)** -- Unlock advanced features like Ollama local models, episodic memory, and NLP scheduling
- **[Developer Guide](./developer.md)** -- Configure settings, authentication, environment, and CLI tooling
