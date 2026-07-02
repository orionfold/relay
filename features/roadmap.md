# Product Roadmap

## MVP

### Foundation Layer

Features that everything else depends on — CLI distribution, database, and app shell.

| Feature | Priority | Status | Dependencies |
|---------|----------|--------|--------------|
| [cli-bootstrap](cli-bootstrap.md) | P0 | completed | — |
| [database-schema](database-schema.md) | P0 | completed | — |
| [app-shell](app-shell.md) | P0 | completed | — |

### Core Layer

Primary user-facing features that deliver the product's main value: the kanban board, agent execution, notifications, and monitoring.

| Feature | Priority | Status | Dependencies |
|---------|----------|--------|--------------|
| [project-management](project-management.md) | P1 | completed | database-schema, app-shell |
| [task-board](task-board.md) | P1 | completed | database-schema, app-shell, project-management |
| [agent-integration](agent-integration.md) | P1 | completed | database-schema, task-board |
| [inbox-notifications](inbox-notifications.md) | P1 | completed | database-schema, app-shell, agent-integration |
| [monitoring-dashboard](monitoring-dashboard.md) | P1 | completed | database-schema, app-shell, agent-integration |

### Polish Layer

Features that enhance the product but aren't essential for first use — homepage, UX fixes, AI assistance, workflows, rich content, and session management.

| Feature | Priority | Status | Dependencies |
|---------|----------|--------|--------------|
| [homepage-dashboard](homepage-dashboard.md) | P1 | completed | database-schema, app-shell, project-management, task-board, agent-integration, inbox-notifications, monitoring-dashboard |
| [ux-gap-fixes](ux-gap-fixes.md) | P1 | completed | task-board, inbox-notifications, monitoring-dashboard, project-management |
| [task-definition-ai](task-definition-ai.md) | P2 | completed | agent-integration, task-board |
| [workflow-engine](workflow-engine.md) | P2 | completed | agent-integration, task-board |
| [content-handling](content-handling.md) | P2 | completed | task-board, agent-integration |
| [session-management](session-management.md) | P2 | completed | agent-integration |

## Post-MVP

### Dropped — not pursuing

The app **distribution / marketplace** ambition (`.sap` portable format, remix/forking, app
updates & dependencies, distribution channels, curated collections, reviews, the embeddable
install widget, and local-first marketplace discovery) is **cut from the active roadmap** per the
aggressive concentration cutline in `_IDEAS/reprioritze.md` §4 (2026-06-29). It presumes adoption
Relay doesn't have yet and competes with the studio's own distribution. The **local app manifest**
(`src/lib/apps/**`, `/apps`) is the KEEP — the composability moat we're concentrating on; only the
*marketplace* layer on top of it is dropped. Revisit only on a genuine third-party-author demand
signal. Affected specs (now `status: dropped`): app-distribution-channels,
app-embeddable-install-widget, app-forking-remix, app-package-format, app-remix,
app-single-file-format, app-updates-dependencies, curated-collections, marketplace-install-hardening,
marketplace-local-first-discovery, marketplace-reviews.

The **telemetry cockpit** and **plugin fall-through** are **frozen (maintain-only)** — scope-locked
via marker comments, not dropped. See `_SPECS/feature-cut-freeze.md` Target 4.

### Document Management

| Feature | Priority | Status | Dependencies |
|---------|----------|--------|--------------|
| [file-attachment-data-layer](file-attachment-data-layer.md) | P1 | completed | content-handling |
| [document-preprocessing](document-preprocessing.md) | P2 | completed | file-attachment-data-layer |
| [agent-document-context](agent-document-context.md) | P1 | completed | file-attachment-data-layer, document-preprocessing |
| [document-manager](document-manager.md) | P2 | completed | file-attachment-data-layer, document-preprocessing |
| [document-output-generation](document-output-generation.md) | P3 | completed | file-attachment-data-layer, agent-document-context |
| [workflow-document-pool](workflow-document-pool.md) | P1 | completed | workflow-engine, file-attachment-data-layer, document-preprocessing, agent-document-context, document-output-generation, workflow-ux-overhaul |

### Agent Intelligence

| Feature | Priority | Status | Dependencies |
|---------|----------|--------|--------------|
| [multi-agent-routing](multi-agent-routing.md) | P3 | completed | agent-integration |
| [autonomous-loop-execution](autonomous-loop-execution.md) | P3 | completed | workflow-engine, agent-integration |
| [multi-agent-swarm](multi-agent-swarm.md) | P3 | completed | workflow-engine, multi-agent-routing |
| [ai-assist-workflow-creation](ai-assist-workflow-creation.md) | P1 | completed | task-definition-ai, workflow-engine, agent-profile-catalog |
| [agent-self-improvement](agent-self-improvement.md) | P3 | completed | workflow-engine, multi-agent-routing, autonomous-loop-execution |
| [workflow-context-batching](workflow-context-batching.md) | P2 | completed | agent-self-improvement, workflow-engine |
| [workflow-learning-approval-reliability](workflow-learning-approval-reliability.md) | P1 | completed | workflow-context-batching, inbox-notifications, learned-context-ux-completion |

### Agent Profiles

| Feature | Priority | Status | Dependencies |
|---------|----------|--------|--------------|
| [agent-profile-catalog](agent-profile-catalog.md) | P3 | completed | multi-agent-routing |
| [workflow-blueprints](workflow-blueprints.md) | P3 | completed | multi-agent-routing, workflow-engine, agent-profile-catalog |
| [skills-repo-import](skills-repo-import.md) | P2 | completed | agent-profile-catalog, skill-portfolio, environment-scanner |
| [profile-ai-assist-ux](profile-ai-assist-ux.md) | P1 | completed | agent-profile-catalog, task-definition-ai, profile-surface-stability |

### UI Enhancement

| Feature                                                             | Priority | Status    | Dependencies                                                                                             |
| ------------------------------------------------------------------- | -------- | --------- | -------------------------------------------------------------------------------------------------------- |
| [ambient-approval-toast](ambient-approval-toast.md)                 | P1       | completed | app-shell, inbox-notifications, tool-permission-persistence                                              |
| [learned-context-ux-completion](learned-context-ux-completion.md)   | P2       | completed | agent-self-improvement, agent-profile-catalog                                                            |
| [micro-visualizations](micro-visualizations.md)                     | P2       | completed | homepage-dashboard, monitoring-dashboard, project-management                                             |
| [command-palette-enhancement](command-palette-enhancement.md)       | P2       | completed | app-shell                                                                                                |
| [operational-surface-foundation](operational-surface-foundation.md) | P2       | completed | app-shell, homepage-dashboard, task-board, inbox-notifications, monitoring-dashboard, project-management |
| [profile-surface-stability](profile-surface-stability.md)           | P2       | completed | operational-surface-foundation, agent-profile-catalog                                                    |
| [accessibility](accessibility.md)                                   | P2       | completed | app-shell, task-board, workflow-engine, content-handling                                                |
| [ui-density-refinement](ui-density-refinement.md)                   | P2       | completed | operational-surface-foundation, app-shell, homepage-dashboard, inbox-notifications, project-management   |
| [kanban-board-operations](kanban-board-operations.md)               | P2       | completed | task-board, task-definition-ai                                                                           |
| [board-context-persistence](board-context-persistence.md)           | P2       | completed | task-board, kanban-board-operations                                                                      |
| [detail-view-redesign](detail-view-redesign.md)                     | P2       | completed | task-board, document-manager, workflow-engine, ui-density-refinement                                     |
| [playbook-documentation](playbook-documentation.md)                 | P2       | removed   | app-shell, command-palette-enhancement                                                                   |
| [documentation-adoption-tracking](documentation-adoption-tracking.md) | P2     | removed   | playbook-documentation, database-schema                                                                  |
| [keyboard-shortcut-system](keyboard-shortcut-system.md)             | P2       | completed | app-shell, command-palette-enhancement                                                                   |
| [workflow-ux-overhaul](workflow-ux-overhaul.md)                     | P1       | completed | workflow-engine, ai-assist-workflow-creation, agent-document-context, document-output-generation        |
| [settings-interactive-controls](settings-interactive-controls.md)   | P2       | completed | —                                                                                                        |
| [sidebar-ia-route-restructure](sidebar-ia-route-restructure.md)     | P1       | completed | app-shell, task-board, homepage-dashboard, keyboard-shortcut-system, command-palette-enhancement         |

### Browser & Automation

| Feature | Priority | Status | Dependencies |
|---------|----------|--------|--------------|
| [browser-use](browser-use.md) | P1 | completed | chat-engine, agent-integration, tool-permission-persistence |

### Platform

| Feature | Priority | Status | Dependencies |
|---------|----------|--------|--------------|
| [scheduled-prompt-loops](scheduled-prompt-loops.md) | P2 | completed | workflow-engine, agent-integration |
| [tool-permission-persistence](tool-permission-persistence.md) | P2 | completed | agent-integration, inbox-notifications |
| [provider-runtime-abstraction](provider-runtime-abstraction.md) | P1 | completed | agent-integration, inbox-notifications, monitoring-dashboard, session-management, tool-permission-persistence |
| [openai-codex-app-server](openai-codex-app-server.md) | P1 | completed | provider-runtime-abstraction |
| [codex-chatgpt-authentication](codex-chatgpt-authentication.md) | P1 | completed | openai-codex-app-server, provider-runtime-abstraction |
| [codex-auth-session-isolation](codex-auth-session-isolation.md) | P1 | completed | codex-chatgpt-authentication |
| [npm-publish-readiness](npm-publish-readiness.md) | P3 | deferred | cli-bootstrap, database-schema, app-shell |
| [cross-provider-profile-compatibility](cross-provider-profile-compatibility.md) | P2 | completed | provider-runtime-abstraction, openai-codex-app-server, agent-profile-catalog |
| [parallel-research-fork-join](parallel-research-fork-join.md) | P2 | completed | workflow-engine, multi-agent-routing |
| [tool-permission-presets](tool-permission-presets.md) | P2 | completed | tool-permission-persistence |
| [chat-settings-tool](chat-settings-tool.md) | P1 | completed | tool-permission-persistence, chat-engine |
| [task-hierarchy-clarity](task-hierarchy-clarity.md) | P1 | completed | workflow-engine, task-board, project-management |
| [agent-document-api-access](agent-document-api-access.md) | P2 | completed | document-preprocessing, file-attachment-data-layer, tool-permission-persistence |
| [database-snapshot-backup](database-snapshot-backup.md) | P1 | completed | — |

### Workspace Intelligence

| Feature | Priority | Status | Dependencies |
|---------|----------|--------|--------------|
| [workspace-context-awareness](workspace-context-awareness.md) | P1 | completed | chat-engine, environment-scanner |
| [auto-environment-scan](auto-environment-scan.md) | P1 | completed | environment-scanner, environment-cache |
| [project-scoped-profiles](project-scoped-profiles.md) | P1 | completed | agent-profile-catalog, environment-scanner, auto-environment-scan |
| [dynamic-slash-commands](dynamic-slash-commands.md) | P2 | completed | chat-command-mentions, chat-input-composer, project-scoped-profiles |

### Direct API Runtime Expansion

| Feature | Priority | Status | Dependencies |
|---------|----------|--------|--------------|
| [provider-agnostic-tool-layer](provider-agnostic-tool-layer.md) | P0 | completed | provider-runtime-abstraction |
| [anthropic-direct-runtime](anthropic-direct-runtime.md) | P1 | completed | provider-agnostic-tool-layer, provider-runtime-abstraction, cross-provider-profile-compatibility |
| [openai-direct-runtime](openai-direct-runtime.md) | P1 | completed | provider-agnostic-tool-layer, provider-runtime-abstraction, cross-provider-profile-compatibility |
| [smart-runtime-router](smart-runtime-router.md) | P1 | completed | anthropic-direct-runtime, openai-direct-runtime, multi-agent-routing |
| [direct-runtime-prompt-caching](direct-runtime-prompt-caching.md) | P2 | in-progress | anthropic-direct-runtime |
| [direct-runtime-advanced-capabilities](direct-runtime-advanced-capabilities.md) | P2 | in-progress | anthropic-direct-runtime, openai-direct-runtime |

### Runtime Quality

| Feature | Priority | Status | Dependencies |
|---------|----------|--------|--------------|
| [sdk-runtime-hardening](sdk-runtime-hardening.md) | P2 | completed | provider-runtime-abstraction, usage-metering-ledger, spend-budget-guardrails, agent-self-improvement |
| [e2e-test-automation](e2e-test-automation.md) | P2 | completed | provider-runtime-abstraction, workflow-engine, agent-profile-catalog |
| [runtime-validation-hardening](runtime-validation-hardening.md) | P1 | completed | provider-runtime-abstraction, multi-agent-routing |
| [routing-cascade-dual-provider](routing-cascade-dual-provider.md) | P1 | completed | provider-runtime-abstraction, runtime-capability-matrix |

### Governance & Analytics

| Feature | Priority | Status | Dependencies |
|---------|----------|--------|--------------|
| [usage-metering-ledger](usage-metering-ledger.md) | P1 | completed | provider-runtime-abstraction, openai-codex-app-server, monitoring-dashboard |
| [spend-budget-guardrails](spend-budget-guardrails.md) | P1 | completed | usage-metering-ledger, inbox-notifications, provider-runtime-abstraction |
| [codex-subscription-governance](codex-subscription-governance.md) | P2 | completed | codex-chatgpt-authentication, spend-budget-guardrails |
| [cost-and-usage-dashboard](cost-and-usage-dashboard.md) | P2 | completed | usage-metering-ledger, spend-budget-guardrails, micro-visualizations |
| [workflow-budget-governance](workflow-budget-governance.md) | P1 | completed | spend-budget-guardrails, workflow-engine |
| [workflow-runtime-configuration](workflow-runtime-configuration.md) | P1 | completed | provider-runtime-abstraction, workflow-engine, smart-runtime-router |
| [workflow-execution-resilience](workflow-execution-resilience.md) | P1 | completed | workflow-engine, workflow-document-pool |
| [workflow-intelligence-observability](workflow-intelligence-observability.md) | P2 | completed | workflow-budget-governance, workflow-runtime-configuration, workflow-execution-resilience, usage-metering-ledger, monitoring-dashboard |

### Environment Onboarding (Control Plane)

| Feature | Priority | Status | Dependencies |
|---------|----------|--------|--------------|
| [environment-scanner](environment-scanner.md) | P0 | completed | — |
| [environment-cache](environment-cache.md) | P0 | completed | environment-scanner |
| [environment-dashboard](environment-dashboard.md) | P0 | completed | environment-cache |
| [git-checkpoint-manager](git-checkpoint-manager.md) | P1 | completed | environment-cache |
| [environment-sync-engine](environment-sync-engine.md) | P1 | completed | git-checkpoint-manager |
| [project-onboarding-flow](project-onboarding-flow.md) | P2 | completed | environment-dashboard |
| [environment-templates](environment-templates.md) | P2 | completed | environment-sync-engine |
| [cross-project-comparison](cross-project-comparison.md) | P2 | completed | environment-cache |
| [skill-portfolio](skill-portfolio.md) | P2 | completed | environment-cache |
| [environment-health-scoring](environment-health-scoring.md) | P3 | completed | environment-cache |
| [agent-profile-from-environment](agent-profile-from-environment.md) | P3 | completed | environment-cache, multi-agent-routing |
| [workspace-discovery](workspace-discovery.md) | P1 | completed | environment-scanner, environment-cache |
| [profile-environment-sync](profile-environment-sync.md) | P1 | completed | agent-profile-from-environment, environment-cache, agent-profile-catalog, skill-portfolio |

### Chat Conversation

| Feature | Priority | Status | Dependencies |
|---------|----------|--------|--------------|
| [chat-data-layer](chat-data-layer.md) | P0 | completed | database-schema, provider-runtime-abstraction |
| [chat-engine](chat-engine.md) | P0 | completed | chat-data-layer, provider-runtime-abstraction, multi-agent-routing |
| [chat-api-routes](chat-api-routes.md) | P0 | completed | chat-data-layer, chat-engine |
| [chat-ui-shell](chat-ui-shell.md) | P1 | completed | chat-api-routes, app-shell, operational-surface-foundation |
| [chat-message-rendering](chat-message-rendering.md) | P1 | completed | chat-ui-shell, chat-api-routes |
| [chat-input-composer](chat-input-composer.md) | P1 | completed | chat-ui-shell, chat-api-routes |
| [chat-conversation-persistence](chat-conversation-persistence.md) | P1 | completed | chat-data-layer, chat-ui-shell |
| [chat-command-mentions](chat-command-mentions.md) | P1 | completed | chat-input-composer, chat-engine, command-palette-enhancement |
| [codex-chat-engine](codex-chat-engine.md) | P1 | completed | chat-engine, openai-codex-app-server, provider-runtime-abstraction |

### Chat Context Experience

Runtime-native skills, filesystem context, file mentions, and a command-namespace redesign that brings CLI parity to ainative chat while preserving the differentiation layer. Source: `ideas/chat-context-experience.md` (2026-04-13).

| Feature | Priority | Status | Dependencies |
|---------|----------|--------|--------------|
| [runtime-capability-matrix](runtime-capability-matrix.md) | P1 | completed | provider-runtime-abstraction |
| [chat-claude-sdk-skills](chat-claude-sdk-skills.md) | P0 | completed | chat-engine, runtime-capability-matrix, skill-portfolio, environment-scanner |
| [task-runtime-skill-parity](task-runtime-skill-parity.md) | P1 | completed | chat-claude-sdk-skills, agent-integration, task-runtime-ainative-mcp-injection |
| [chat-codex-app-server-skills](chat-codex-app-server-skills.md) | P1 | completed | chat-claude-sdk-skills, codex-chat-engine, openai-codex-app-server, environment-scanner, runtime-capability-matrix |
| [chat-ollama-native-skills](chat-ollama-native-skills.md) | P2 | completed | chat-claude-sdk-skills, ollama-runtime-provider, environment-scanner, runtime-capability-matrix, chat-data-layer |
| [chat-file-mentions](chat-file-mentions.md) | P1 | completed | chat-command-mentions, chat-claude-sdk-skills, workspace-context-awareness |
| [chat-command-namespace-refactor](chat-command-namespace-refactor.md) | P1 | completed | chat-claude-sdk-skills, chat-file-mentions, runtime-capability-matrix, command-palette-enhancement |
| [chat-environment-integration](chat-environment-integration.md) | P2 | completed | chat-command-namespace-refactor, environment-dashboard, environment-cache, profile-environment-sync, environment-health-scoring |
| [chat-advanced-ux](chat-advanced-ux.md) | P3 | deferred | ← retired umbrella, split 2026-04-14 into 5 sub-specs ↓ |
| [chat-conversation-templates](chat-conversation-templates.md) | P2 | completed | workflow-blueprints, chat-conversation-persistence, chat-command-namespace-refactor |
| [chat-filter-namespace](chat-filter-namespace.md) | P2 | completed | chat-command-namespace-refactor, chat-environment-integration |
| [chat-pinned-saved-searches](chat-pinned-saved-searches.md) | P3 | completed | chat-filter-namespace, chat-command-namespace-refactor |
| [chat-skill-composition](chat-skill-composition.md) | P3 | completed | chat-claude-sdk-skills, chat-codex-app-server-skills, chat-ollama-native-skills, chat-environment-integration |
| [chat-composition-ui-v1](chat-composition-ui-v1.md) | P1 | completed | chat-skill-composition, chat-command-namespace-refactor |
| [saved-search-polish-v1](saved-search-polish-v1.md) | P2 | completed | chat-pinned-saved-searches |
| [chat-conversation-branches](chat-conversation-branches.md) | P3 | completed | chat-conversation-persistence, chat-data-layer |
| [onboarding-runtime-provider-choice](onboarding-runtime-provider-choice.md) | P2 | completed | app-shell, provider-runtime-abstraction, runtime-capability-matrix |
| [chat-polish-bundle-v1](chat-polish-bundle-v1.md) | P3 | completed | chat-filter-namespace, chat-pinned-saved-searches, saved-search-polish-v1 |

### Living Book

| Feature | Priority | Status | Dependencies |
|---------|----------|--------|--------------|
| [living-book-content-merge](living-book-content-merge.md) | P1 | **completed** | playbook-documentation |
| [living-book-authors-notes](living-book-authors-notes.md) | P2 | **completed** | living-book-content-merge |
| [living-book-reading-paths](living-book-reading-paths.md) | P2 | **completed** | living-book-content-merge, playbook-documentation |
| [living-book-markdown-pipeline](living-book-markdown-pipeline.md) | P2 | **completed** | living-book-content-merge, playbook-documentation |
| [living-book-self-updating](living-book-self-updating.md) | P3 | **completed** | living-book-markdown-pipeline, workflow-engine, ai-assist-workflow-creation, agent-document-context |

### Vision Alignment — Business Positioning

| Feature | Priority | Status | Dependencies |
|---------|----------|--------|--------------|
| [product-messaging-refresh](product-messaging-refresh.md) | P0 | completed | — |
| [business-function-profiles](business-function-profiles.md) | P1 | completed | agent-profile-catalog, workflow-blueprints |

### Vision Alignment — Proactive Intelligence

| Feature | Priority | Status | Dependencies |
|---------|----------|--------|--------------|
| [heartbeat-scheduler](heartbeat-scheduler.md) | P0 | completed | scheduled-prompt-loops |
| [natural-language-scheduling](natural-language-scheduling.md) | P1 | completed | heartbeat-scheduler |
| [agent-episodic-memory](agent-episodic-memory.md) | P1 | completed | agent-self-improvement |

### Vision Alignment — Multi-Channel & Coordination

| Feature | Priority | Status | Dependencies |
|---------|----------|--------|--------------|
| [multi-channel-delivery](multi-channel-delivery.md) | P2 | completed | heartbeat-scheduler |
| [bidirectional-channel-chat](bidirectional-channel-chat.md) | P1 | completed | multi-channel-delivery, chat-engine |
| [agent-async-handoffs](agent-async-handoffs.md) | P2 | completed | multi-agent-routing, heartbeat-scheduler |

### Structured Data (Tables)

| Feature | Priority | Status | Dependencies |
|---------|----------|--------|--------------|
| [tables-data-layer](tables-data-layer.md) | P0 | completed | — |
| [tables-list-page](tables-list-page.md) | P0 | completed | tables-data-layer |
| [tables-spreadsheet-editor](tables-spreadsheet-editor.md) | P0 | completed | tables-data-layer |
| [tables-document-import](tables-document-import.md) | P0 | completed | tables-data-layer, tables-spreadsheet-editor |
| [tables-template-gallery](tables-template-gallery.md) | P1 | completed | tables-data-layer |
| [tables-computed-columns](tables-computed-columns.md) | P1 | completed | tables-spreadsheet-editor |
| [tables-agent-integration](tables-agent-integration.md) | P1 | completed | tables-data-layer, tables-spreadsheet-editor |
| [tables-chat-queries](tables-chat-queries.md) | P1 | completed | tables-data-layer, tables-agent-integration |
| [tables-enrichment-runtime-v2](tables-enrichment-runtime-v2.md) | P1 | completed | bulk-row-enrichment, workflow-engine, workflow-runtime-configuration |
| [tables-enrichment-planner-api](tables-enrichment-planner-api.md) | P1 | completed | tables-enrichment-runtime-v2, provider-runtime-abstraction, tables-agent-integration |
| [tables-enrichment-planner-ux](tables-enrichment-planner-ux.md) | P1 | completed | tables-enrichment-planner-api, workflow-ux-overhaul, operational-surface-foundation |
| [tables-cross-joins](tables-cross-joins.md) | P2 | completed | tables-computed-columns |
| [tables-agent-charts](tables-agent-charts.md) | P2 | completed | tables-agent-integration, tables-chat-queries |
| [tables-workflow-triggers](tables-workflow-triggers.md) | P2 | completed | tables-agent-integration |
| [tables-nl-creation](tables-nl-creation.md) | P3 | completed | tables-chat-queries |
| [tables-export](tables-export.md) | P3 | completed | tables-spreadsheet-editor |
| [tables-versioning](tables-versioning.md) | P3 | completed | tables-spreadsheet-editor |

### Entity Relationships

| Feature | Priority | Status | Dependencies |
|---------|----------|--------|--------------|
| [workflow-run-history](workflow-run-history.md) | P1 | completed | workflow-engine, workflow-editing, document-output-generation |
| [entity-relationship-detail-views](entity-relationship-detail-views.md) | P2 | completed | workflow-run-history, detail-view-redesign |
| [relationship-summary-cards](relationship-summary-cards.md) | P2 | completed | entity-relationship-detail-views |

### PLG Monetization — Foundation Layer

> **Fully superseded by `community-edition-simplification` (2026-04-13).** Every row in the three PLG Monetization sections below shipped and was later fully reverted when ainative pivoted to a 100% free Community Edition. Kept as historical record.

| Feature | Priority | Status | Dependencies |
|---------|----------|--------|--------------|
| [local-license-manager](local-license-manager.md) | P0 | completed | — |
| [supabase-cloud-backend](supabase-cloud-backend.md) | P0 | completed | — |
| [stripe-billing-integration](stripe-billing-integration.md) | P0 | completed | supabase-cloud-backend |

### PLG Monetization — Core Layer

| Feature | Priority | Status | Dependencies |
|---------|----------|--------|--------------|
| [community-edition-soft-limits](community-edition-soft-limits.md) | P0 | completed | local-license-manager |
| [subscription-management-ui](subscription-management-ui.md) | P1 | completed | local-license-manager, stripe-billing-integration |
| [upgrade-cta-banners](upgrade-cta-banners.md) | P1 | completed | local-license-manager, community-edition-soft-limits, subscription-management-ui |
| [outcome-analytics-dashboard](outcome-analytics-dashboard.md) | P1 | completed | local-license-manager |
| [parallel-workflow-limit](parallel-workflow-limit.md) | P2 | completed | local-license-manager |
| [cloud-sync](cloud-sync.md) | P1 | completed | local-license-manager, supabase-cloud-backend, stripe-billing-integration |
| [license-activation-flow](license-activation-flow.md) | P1 | completed | local-license-manager, stripe-billing-integration, subscription-management-ui |
| [marketplace-access-gate](marketplace-access-gate.md) | P1 | completed | local-license-manager, supabase-cloud-backend |

### PLG Monetization — Growth Layer

| Feature | Priority | Status | Dependencies |
|---------|----------|--------|--------------|
| [edition-readme-update](edition-readme-update.md) | P1 | completed | — |
| [first-run-onboarding](first-run-onboarding.md) | P1 | completed | local-license-manager, supabase-cloud-backend |
| [marketing-site-pricing-page](marketing-site-pricing-page.md) | P1 | completed | stripe-billing-integration |
| [transactional-email-flows](transactional-email-flows.md) | P2 | completed | supabase-cloud-backend, stripe-billing-integration, community-edition-soft-limits |
| [telemetry-foundation](telemetry-foundation.md) | P2 | completed | supabase-cloud-backend, local-license-manager |
| [upgrade-conversion-instrumentation](upgrade-conversion-instrumentation.md) | P3 | completed | supabase-cloud-backend, upgrade-cta-banners, community-edition-soft-limits |

### Community Edition Simplification

Reversal of the PLG Monetization stack. ainative becomes a single free Community Edition with all features unlocked — no tiers, no billing, no cloud dependency, no telemetry. Supersedes every row in the three PLG Monetization sections above.

| Feature | Priority | Status | Dependencies |
|---------|----------|--------|--------------|
| [community-edition-simplification](community-edition-simplification.md) | P0 | completed | — |
| [remove-supabase-dependencies](remove-supabase-dependencies.md) | P0 | completed | community-edition-simplification |
| [remove-anonymous-telemetry](remove-anonymous-telemetry.md) | P0 | completed | remove-supabase-dependencies |

### Vision Alignment — Runtime Expansion

| Feature | Priority | Status | Dependencies |
|---------|----------|--------|--------------|
| [ollama-runtime-provider](ollama-runtime-provider.md) | P2 | completed | provider-runtime-abstraction |

### Clone Lifecycle & Self-Upgrade

Automates the PRIVATE-INSTANCES runbook — turns the manual `git merge main` + scale activation dance into a guided in-app flow for every git-clone user. Foundation for the self-modifying dev env model where users customize ainative via ainative chat itself.

| Feature | Priority | Status | Dependencies |
|---------|----------|--------|--------------|
| [instance-bootstrap](instance-bootstrap.md) | P1 | completed | — |
| [upgrade-detection](upgrade-detection.md) | P1 | completed | instance-bootstrap, scheduled-prompt-loops |
| [upgrade-session](upgrade-session.md) | P1 | in-progress | instance-bootstrap, upgrade-detection, agent-integration, agent-profile-catalog |
| [instance-license-metering](instance-license-metering.md) | P2 | deferred | instance-bootstrap, local-license-manager, license-activation-flow |
| [instance-bootstrap-local-branch-shim](instance-bootstrap-local-branch-shim.md) | P2 | completed | instance-bootstrap, upgrade-detection |

### Growth-Enabling Primitives

General-purpose workflow and table capabilities identified while building the Growth module — both deliberately added to ainative core (not Growth) because they serve every user, not just revenue operators. Extracted from `2026-04-08-ainative-core-growth-primitives-design.md`.

| Feature | Priority | Status | Dependencies |
|---------|----------|--------|--------------|
| [workflow-step-delays](workflow-step-delays.md) | P1 | completed | workflow-engine, scheduled-prompt-loops |
| [bulk-row-enrichment](bulk-row-enrichment.md) | P1 | completed | workflow-engine, tables-data-layer, tables-workflow-triggers, multi-agent-routing |

### Platform Hardening

Durable fixes that replace symptom-level hotfixes with architectural contracts. Each feature in this section is paired with a TDR that codifies the invariant so the same class of bug cannot recur.

| Feature | Priority | Status | Dependencies |
|---------|----------|--------|--------------|
| [workflow-status-view-pattern-router](workflow-status-view-pattern-router.md) | P2 | completed | workflow-engine, autonomous-loop-execution, bulk-row-enrichment |
| [workflow-create-dedup](workflow-create-dedup.md) | P1 | completed | chat-engine, workflow-engine |
| [chat-stream-resilience-telemetry](chat-stream-resilience-telemetry.md) | P2 | completed | chat-engine, chat-api-routes |
| [chat-session-persistence-provider](chat-session-persistence-provider.md) | P0 | completed | chat-engine, chat-ui-shell, chat-stream-resilience-telemetry |
| [marketplace-install-hardening](marketplace-install-hardening.md) | P1 | deferred | instance-bootstrap |
| [enrichment-planner-test-hardening](enrichment-planner-test-hardening.md) | P2 | completed | tables-enrichment-runtime-v2, tables-enrichment-planner-api |
| [chat-dedup-variant-tolerance](chat-dedup-variant-tolerance.md) | P3 | completed | workflow-create-dedup |
| [task-runtime-ainative-mcp-injection](task-runtime-ainative-mcp-injection.md) | P0 | completed | agent-integration, chat-engine |
| [task-create-profile-validation](task-create-profile-validation.md) | P1 | completed | agent-integration, agent-profile-catalog |
| [schedule-maxturns-api-control](schedule-maxturns-api-control.md) | P2 | completed | scheduled-prompt-loops |
| [schedule-collision-prevention](schedule-collision-prevention.md) | P1 | completed | scheduled-prompt-loops, heartbeat-scheduler |
| [task-turn-observability](task-turn-observability.md) | P2 | completed | agent-integration, scheduled-prompt-loops |
| [profile-runtime-default-resolution](profile-runtime-default-resolution.md) | P1 | completed | row-trigger-blueprint-execution |
| [workflow-editing](workflow-editing.md) | P1 | completed | workflow-engine |

### App Marketplace — Foundation Layer

Runtime bundle system, packaging format, and install hardening. The keystone for all marketplace features.

| Feature | Priority | Status | Dependencies |
|---------|----------|--------|--------------|
| [app-runtime-bundle-foundation](app-runtime-bundle-foundation.md) | P0 | completed | database-schema |
| [marketplace-install-hardening](marketplace-install-hardening.md) | P1 | deferred | instance-bootstrap |
| [app-package-format](app-package-format.md) | P1 | deferred | marketplace-install-hardening |
| [app-seed-data-generation](app-seed-data-generation.md) | P1 | deferred | app-package-format |
| [app-cli-tools](app-cli-tools.md) | P1 | completed | app-package-format, app-seed-data-generation |
| [app-conflict-resolution](app-conflict-resolution.md) | P2 | deferred | app-package-format, marketplace-install-hardening |
| [app-updates-dependencies](app-updates-dependencies.md) | P2 | deferred | app-conflict-resolution, app-cli-tools |
| [app-single-file-format](app-single-file-format.md) | P2 | deferred | app-package-format |
| [fix-exported-bundle-registration](fix-exported-bundle-registration.md) | P1 | deferred | app-runtime-bundle-foundation |
| [fix-sidebar-reactive-update](fix-sidebar-reactive-update.md) | P1 | deferred | app-runtime-bundle-foundation |
| [fix-sidebar-accordion-behavior](fix-sidebar-accordion-behavior.md) | P2 | deferred | app-runtime-bundle-foundation |

### App Marketplace — Extended Primitives

Growing the composition grammar from 7 primitives to ~18, enabling richer app capabilities.

| Feature | Priority | Status | Dependencies |
|---------|----------|--------|--------------|
| [app-extended-primitives-tier1](app-extended-primitives-tier1.md) | P1 | deferred | marketplace-install-hardening |
| [app-extended-primitives-tier2](app-extended-primitives-tier2.md) | P2 | deferred | app-extended-primitives-tier1 |
| [app-mcp-server-wiring](app-mcp-server-wiring.md) | P2 | deferred | app-extended-primitives-tier2, marketplace-trust-ladder |
| [app-budget-policies](app-budget-policies.md) | P3 | deferred | app-extended-primitives-tier2 |

### App Marketplace — Chat-Native Authoring

Build, remix, and edit apps through conversation — ainative's unique differentiator.

| Feature | Priority | Status | Dependencies |
|---------|----------|--------|--------------|
| [chat-app-builder](chat-app-builder.md) | P1 | completed | app-package-format, app-extended-primitives-tier1 |
| [promote-conversation-to-app](promote-conversation-to-app.md) | P1 | completed | chat-app-builder, app-seed-data-generation |
| [app-remix](app-remix.md) | P2 | deferred | chat-app-builder |
| [conversational-app-editing](conversational-app-editing.md) | P2 | deferred | chat-app-builder |
| [visual-app-studio](visual-app-studio.md) | P2 | deferred | app-extended-primitives-tier2, app-package-format |

### App Marketplace — Distribution & Community

Marketplace listing, publishing, trust, and community ecosystem features.

| Feature | Priority | Status | Dependencies |
|---------|----------|--------|--------------|
| [marketplace-app-listing](marketplace-app-listing.md) | P1 | completed | marketplace-access-gate, app-runtime-bundle-foundation |
| [marketplace-app-publishing](marketplace-app-publishing.md) | P1 | completed | app-package-format, app-cli-tools, marketplace-access-gate |
| [marketplace-trust-ladder](marketplace-trust-ladder.md) | P1 | completed | marketplace-app-publishing, app-extended-primitives-tier1 |
| [app-distribution-channels](app-distribution-channels.md) | P2 | deferred | app-cli-tools, marketplace-app-publishing |
| [app-forking-remix](app-forking-remix.md) | P2 | deferred | marketplace-app-publishing, app-remix |
| [creator-portal](creator-portal.md) | P2 | deferred | marketplace-app-publishing, telemetry-foundation |
| [curated-collections](curated-collections.md) | P3 | deferred | marketplace-trust-ladder |
| [marketplace-reviews](marketplace-reviews.md) | P3 | deferred | marketplace-app-publishing, telemetry-foundation |
| [marketplace-local-first-discovery](marketplace-local-first-discovery.md) | P3 | deferred | marketplace-app-listing |
| [app-embeddable-install-widget](app-embeddable-install-widget.md) | P3 | deferred | marketplace-app-listing |
| [my-apps-lifecycle](my-apps-lifecycle.md) | P1 | deferred | app-runtime-bundle-foundation |

### Self-Extension Platform

Post-rollback composition-first strategy (`ideas/self-extending-machine-strategy.md`, 2026-04-18). Replaces the rolled-back App Marketplace cluster. Ships two plugin kinds only — primitives bundles and chat tools — with deliberate non-goals around publishing, trust tiers, and marketplace distribution.

| Feature | Priority | Status | Dependencies |
|---------|----------|--------|--------------|
| [primitive-bundle-plugin-kind-5](primitive-bundle-plugin-kind-5.md) | P0 | shipped | agent-profile-catalog, workflow-blueprints |
| [schedules-as-yaml-registry](schedules-as-yaml-registry.md) (Milestone 2) | P0 | shipped | primitive-bundle-plugin-kind-5, scheduled-prompt-loops |
| [chat-tools-plugin-kind-1](chat-tools-plugin-kind-1.md) (Milestone 3) | P0 | shipped | primitive-bundle-plugin-kind-5, schedules-as-yaml-registry, chat-engine, provider-runtime-abstraction, runtime-capability-matrix |
| create-plugin-spec + ainative-app fall-through + ExtensionFallbackCard (Milestone 4) | P0 | shipped | chat-tools-plugin-kind-1, TDR-037 accepted |
| [nl-to-composition-v1](nl-to-composition-v1.md) (Milestone 4.5) | P1 | shipped | create-plugin-spec (M4), AppMaterializedCard, ExtensionFallbackCard, chat planner layer |
| [install-parity-audit](install-parity-audit.md) (Milestone 5) | P1 | shipped | nl-to-composition-v1 |

### Composed Apps — Domain-Aware View

Per-app view redesign so that composed apps render domain-aware dashboards driven by manifest configuration, not per-app TSX. Strategy doc: `ideas/composed-apps-domain-aware-view.md`. Six view kits (Tracker, Coach, Inbox, Research, Ledger, Workflow Hub) selected by a deterministic decision table or by an explicit `view:` field. All visuals composed from existing primitives plus a small set of new shared primitives (≥2-kit reuse rule).

| Feature | Priority | Status | Dependencies |
|---------|----------|--------|--------------|
| [composed-app-view-shell](composed-app-view-shell.md) (Phase 1) | P1 | completed | app-shell, agent-profile-catalog, workflow-blueprints, scheduled-prompt-loops, tables-data-layer |
| [composed-app-manifest-view-field](composed-app-manifest-view-field.md) (Phase 1) | P1 | completed | composed-app-view-shell |
| [composed-app-kit-tracker-and-hub](composed-app-kit-tracker-and-hub.md) (Phase 2) | P1 | completed | composed-app-view-shell, composed-app-manifest-view-field, tables-spreadsheet-editor, micro-visualizations |
| [composed-app-kit-coach-and-ledger](composed-app-kit-coach-and-ledger.md) (Phase 3) | P2 | completed | composed-app-kit-tracker-and-hub |
| [composed-app-kit-inbox-and-research](composed-app-kit-inbox-and-research.md) (Phase 4) | P2 | completed | composed-app-kit-coach-and-ledger |
| [composed-app-auto-inference-hardening](composed-app-auto-inference-hardening.md) (Phase 5) | P2 | in-progress | composed-app-kit-inbox-and-research |
| [composed-app-manifest-authoring-tools](composed-app-manifest-authoring-tools.md) (Phase 5) | P3 | completed | composed-app-manifest-view-field, composed-app-auto-inference-hardening, chat-app-builder |
| [row-trigger-blueprint-execution](row-trigger-blueprint-execution.md) (Phase 5) | P1 | completed | composed-app-kit-inbox-and-research, workflow-engine |

### ICP Walkthrough Fixes (2026-07-01)

Groomed from the two-pass ICP browser walkthrough of published `orionfold-relay@0.15.1`
(`_IDEAS/backlog.md`) — 10 blockers, code-claim-verified against the current tree before grooming
(see backlog "Code-claim verification"). Ordered by leverage: fix `mcp-namespace` before
`compose-orchestration` (it removes the spurious prompts); `customer-link-ui` is highest ROI (one
selector unblocks the entire per-customer margin story). `#10 chat-metering` is re-scoped to
diagnose (metering exists in HEAD). Blockers #1/#7 merged into compose-orchestration; #3/#4 merged
into customer-link.

| Feature | Priority | Status | Dependencies |
|---------|----------|--------|--------------|
| [fix-chat-mcp-namespace-relay](fix-chat-mcp-namespace-relay.md) | P0 | done | — |
| [fix-compose-approval-orchestration](fix-compose-approval-orchestration.md) | P0 | planned | fix-chat-mcp-namespace-relay |
| [fix-project-customer-link-ui](fix-project-customer-link-ui.md) | P0 | done | — |
| [fix-pack-core-version-resolution](fix-pack-core-version-resolution.md) | P0 | done | — |
| [fix-workflow-model-preference-propagation](fix-workflow-model-preference-propagation.md) | P1 | completed | — |
| [fix-dashboard-budget-vs-cost-labeling](fix-dashboard-budget-vs-cost-labeling.md) | P1 | completed | — |
| [fix-pack-install-discoverability](fix-pack-install-discoverability.md) | P1 | absorbed → [feat-graduation-surface](feat-graduation-surface.md) | fix-pack-core-version-resolution |
| [feat-graduation-surface](feat-graduation-surface.md) | P1 | done | feat-license-lifecycle |
| [feat-agency-pro-pack](feat-agency-pro-pack.md) | P0 | done (0.19.0) | feat-graduation-surface, feat-license-lifecycle |
| [feat-pack-update-workflow](feat-pack-update-workflow.md) | P0 | done (0.21.0) | feat-agency-pro-pack |
| [feat-renewal-value-recap](feat-renewal-value-recap.md) | P1 | done (0.22.0) | feat-pack-update-workflow, feat-license-lifecycle |
| [fix-chat-spend-metering-diagnose](fix-chat-spend-metering-diagnose.md) | P1 | completed | — |
| [fix-inbox-checkpoint-realtime](fix-inbox-checkpoint-realtime.md) | P2 | planned | — |
| [fix-anthropic-direct-task-serialization](fix-anthropic-direct-task-serialization.md) | P2 | planned | — |

## Dependency Graph

Critical path through the MVP:

```
cli-bootstrap ─────────────────────────────────────────────┐
database-schema ──┬── project-management ── task-board ──┬──┤
app-shell ────────┘                                      │  │
                                          agent-integration ┤
                                                │           │
                              ┌─────────────────┼───────────┘
                              │                 │
                    inbox-notifications   monitoring-dashboard
                              │                 │
                    task-definition-ai    workflow-engine
                              │                 │
                    content-handling    session-management
```

Post-MVP document management chain:

```
content-handling (MVP, completed)
    └── file-attachment-data-layer (P1)
            ├── document-preprocessing (P2)
            │       ├── document-manager (P2)
            │       └── agent-document-context (P1)
            │               └── document-output-generation (P3)
            │                       └── workflow-document-pool (P1, planned)
            └── agent-document-context (P1)
```

Environment onboarding chain:

> Environment and workspace-intelligence chains below are fully shipped. Diagrams retained for dependency reference. See the status table for authoritative per-feature state.

```
environment-scanner
    └── environment-cache
            ├── environment-dashboard
            │       └── project-onboarding-flow
            ├── git-checkpoint-manager
            │       └── environment-sync-engine
            │               └── environment-templates
            ├── cross-project-comparison
            ├── skill-portfolio
            ├── environment-health-scoring
            └── agent-profile-from-environment
                    └── profile-environment-sync

Workspace intelligence chain:

environment-scanner + environment-cache
    └── auto-environment-scan
            └── project-scoped-profiles
                    └── dynamic-slash-commands

chat-engine + environment-scanner
    └── workspace-context-awareness
```

Structured data (Tables) chain:

```
tables-data-layer (P0)
    ├── tables-list-page (P0)
    ├── tables-spreadsheet-editor (P0)
    │       ├── tables-document-import (P0)
    │       ├── tables-computed-columns (P1)
    │       │       └── tables-cross-joins (P2)
    │       ├── tables-export (P3)
    │       └── tables-versioning (P3)
    ├── tables-template-gallery (P1)
    └── tables-agent-integration (P1)
            ├── tables-chat-queries (P1)
            │       └── tables-nl-creation (P3)
            ├── tables-agent-charts (P2)
            └── tables-workflow-triggers (P2)
```

- **Critical path**: database-schema → project-management → task-board → agent-integration → inbox-notifications / monitoring-dashboard
- **Foundation (parallel)**: cli-bootstrap, database-schema, app-shell can all be built simultaneously
- **Polish (parallel)**: P2 features are independent of each other, can be built in any order after agent-integration
- **Document Management**: file-attachment-data-layer unblocks all document features; preprocessing and agent-context can run in parallel
- **Completed**: `ai-assist-workflow-creation` bridges task assist into the workflow engine; all UI enhancement features are completed
- **Runtime Quality**: `sdk-runtime-hardening` tracks cross-cutting SDK audit fixes that span provider-runtime, usage-metering, and budget-guardrails features

Provider runtime chain:

```
agent-integration + inbox-notifications + monitoring-dashboard
        + session-management + tool-permission-persistence
                                │
                                └── provider-runtime-abstraction (completed)
                                            ├── openai-codex-app-server (completed)
                                            ├── cross-provider-profile-compatibility (completed)
                                            └── provider-agnostic-tool-layer (P0)
                                                    ├── anthropic-direct-runtime (P1)
                                                    │       ├── direct-runtime-prompt-caching (P2)
                                                    │       └──┐
                                                    └── openai-direct-runtime (P1)
                                                            └──┤
                                                               ├── smart-runtime-router (P1)
                                                               └── direct-runtime-advanced-capabilities (P2)
```

Cost governance chain:

```
provider-runtime-abstraction + openai-codex-app-server + monitoring-dashboard
                                │
                                └── usage-metering-ledger
                                           ├── spend-budget-guardrails
                                           └── cost-and-usage-dashboard
                                                     ▲
                                                     └── micro-visualizations
```

Workflow expansion chain:

```
workflow-engine + multi-agent-routing
                │
                ├── parallel-research-fork-join
                │         └── multi-agent-swarm
                └── workflow-ux-overhaul (completed)
                          ├── doc context propagation
                          ├── output readability ✓
                          ├── dashboard visibility ✓
                          └── AI assist guidance
```

Chat conversation chain:

```
database-schema + provider-runtime-abstraction + multi-agent-routing
                                │
                                └── chat-data-layer (P0)
                                        └── chat-engine (P0)
                                                └── chat-api-routes (P0)
                                                        ├── chat-ui-shell (P1)
                                                        ├── chat-message-rendering (P1)
                                                        └── chat-input-composer (P1)
```

Living Book chain:

```
playbook-documentation (completed)
    └── living-book-content-merge (completed)
            ├── living-book-authors-notes (completed)
            ├── living-book-reading-paths (completed)
            └── living-book-markdown-pipeline (completed)
                    └── living-book-self-updating (completed)
```

> **PLG Monetization chain removed (2026-04-13).** The license manager, Stripe billing, subscription UI, supabase cloud backend, cloud-sync, upgrade CTAs, telemetry, marketing pricing page, and related chain were implemented and then ripped out in commit `0436803` as part of the community-edition pivot. The specs in the status table remain marked `completed` as an archival record of what shipped pre-pivot — they do not reflect current codebase state. ainative is 100% free community edition; no pricing, tier gates, or billing code exists anywhere.

Vision alignment chain:

```
Phase 1 — Business Positioning (parallel, no code deps)
    ├── product-messaging-refresh (P0)
    └── business-function-profiles (P1)

Phase 2 — Proactive Intelligence
    ├── heartbeat-scheduler (P0) ← scheduled-prompt-loops
    │       └── natural-language-scheduling (P1)
    └── agent-episodic-memory (P1) ← agent-self-improvement

Phase 3 — Coordination + Delivery
    ├── multi-channel-delivery (P2) ← heartbeat-scheduler
    └── agent-async-handoffs (P2) ← heartbeat-scheduler

Phase 4 — Runtime Expansion
    └── ollama-runtime-provider (P2) ← provider-runtime-abstraction
```

## Recommended Build Order

1. **Sprint 1 — Foundation**: cli-bootstrap + database-schema + app-shell (parallel)
2. **Sprint 2 — Core Data**: project-management + task-board
3. **Sprint 3 — Agent Core**: agent-integration
4. **Sprint 4 — Human Loop**: inbox-notifications + monitoring-dashboard (parallel)
5. **Sprint 5 — Polish**: homepage-dashboard (P1) + ux-gap-fixes (P1) + workflow-engine + task-definition-ai + content-handling (parallel, any order; session-management already completed)
6. **Sprint 6 — Document Foundation**: file-attachment-data-layer (P1) — unblocks all document features
7. **Sprint 7 — Document Processing**: document-preprocessing (P2) + agent-document-context (P1) (parallel)
8. **Sprint 8 — Document UI**: document-manager (P2)
9. **Sprint 9 — Document Outputs**: document-output-generation (P3, completed)
10. **Sprint 10 — UI Density Refinement**: ui-density-refinement (P2, completed)
11. **Sprint 11 — Runtime Foundation**: provider-runtime-abstraction (P1, completed)
12. **Sprint 12 — OpenAI Runtime**: openai-codex-app-server (P1, completed)
13. **Sprint 13 — Usage Metering Foundation**: usage-metering-ledger (P1, completed)
14. **Sprint 14 — Budget Enforcement**: spend-budget-guardrails (P1, completed)
15. **Sprint 15 — Cost Visibility**: cost-and-usage-dashboard (P2, completed)
16. **Sprint 16 — Profile Compatibility**: cross-provider-profile-compatibility (P2, completed)
17. **Sprint 17 — Human-Loop Attention**: ambient-approval-toast (P1, completed)
18. **Sprint 18 — Parallel Research Foundation**: parallel-research-fork-join (P2, completed)
19. **Sprint 19 — npm Publish Readiness**: npm-publish-readiness (P3, deferred)
20. **Sprint 20 — Detail Polish**: detail-view-redesign (P2, completed) + playbook-documentation (P2, completed) + learned-context-ux-completion (P2, completed)

> All sprints above are completed or deferred. The Environment Onboarding initiative (11 features) is fully shipped.

21. **Sprint 21 — Chat Data Layer**: chat-data-layer (P0, completed) — DB tables, schema, data access
22. **Sprint 22 — Chat Engine**: chat-engine (P0, completed) — context builder, SDK streaming, entity detection
23. **Sprint 23 — Chat API**: chat-api-routes (P0, completed) — REST + SSE endpoints
24. **Sprint 24 — Chat UI**: chat-ui-shell (P1, completed) + chat-input-composer (P1, completed) + chat-message-rendering (P1, completed) — page layout, input, messages

> Chat Conversation initiative (6 features) fully shipped 2026-03-22. All sprints 21-24 completed.

> Living Book initiative (5 features) fully shipped 2026-03-24. All sprints 25-28 completed.

25. **Sprint 25 — Living Book Foundation** (shipped 2026-03-24): living-book-content-merge — Try It Now cards, chapter-mapping.ts, 9 chapters with playbook cross-references
26. **Sprint 26 — Living Book Enrich** (shipped 2026-03-24): living-book-authors-notes + living-book-reading-paths — collapsible Author's Notes callout, 4 persona-based reading paths with progress tracking
27. **Sprint 27 — Living Book Pipeline** (shipped 2026-03-24): living-book-markdown-pipeline — all chapters migrated to `book/chapters/*.md` with frontmatter, markdown parser, content blocks
28. **Sprint 28 — Living Book Autonomy** (shipped 2026-03-24): living-book-self-updating — chapter regeneration via document-writer agent, git-based staleness detection, live SSE progress streaming, ChapterGenerationBar UI

29. **Sprint 29 — Tool Decoupling**: provider-agnostic-tool-layer (P0) — extract 50+ tool definitions from Claude SDK dependency into provider-neutral format
30. **Sprint 30 — Direct API Runtimes**: anthropic-direct-runtime (P1) + openai-direct-runtime (P1) — parallel build of both direct API adapters with shared agentic loop
31. **Sprint 31 — Smart Routing**: smart-runtime-router (P1) — auto-select best runtime per task based on content, profile affinity, and user preference
32. **Sprint 32 — Direct Runtime Polish**: direct-runtime-prompt-caching (P2) + direct-runtime-advanced-capabilities (P2) — prompt caching, extended thinking, context compaction, model selection, server-side tool config

> Direct API Runtime Expansion initiative (4 of 6 features) shipped 2026-03-31. Sprints 29-31 completed. Sprint 32 (polish) planned.

33. **Sprint 33 — Business Positioning**: product-messaging-refresh (P0) + business-function-profiles (P1) — README/docs repositioning and 6 new business profiles + 5 new workflow blueprints (parallel)
34. **Sprint 34 — Heartbeat Engine**: heartbeat-scheduler (P0) — proactive agent execution with checklist, suppression, active hours, cost controls
35. **Sprint 35 — Agent Intelligence**: agent-episodic-memory (P1) + natural-language-scheduling (P1) — persistent knowledge memory and NLP schedule parsing (parallel)
36. **Sprint 36 — Coordination**: multi-channel-delivery (P2) + agent-async-handoffs (P2) — Slack/Telegram delivery and inter-agent message bus (parallel)
37. **Sprint 37 — Local Runtime**: ollama-runtime-provider (P2) — local model execution via Ollama

38. **Sprint 38 — Tables Foundation**: tables-data-layer (P0) + tables-list-page (P0) — 12 new DB tables (hybrid JSON rows), CRUD API, query builder with json_extract(), 12 built-in templates, /tables list page with sidebar nav
39. **Sprint 39 — Tables Editor**: tables-spreadsheet-editor (P0) — inline cell editing with type-aware controls, keyboard nav (Tab/Enter/Escape/Arrows), optimistic debounced saves, column management
40. **Sprint 40 — Tables Import + Templates**: tables-document-import (P0) + tables-template-gallery (P1) — document picker integration, column type inference, mapping wizard; template gallery with preview + clone flow
41. **Sprint 41 — Tables Agent Integration**: tables-agent-integration (P1) + tables-chat-queries (P1) — 12 agent tools, table context builder, TablePickerSheet, NL-to-query engine, chat inline table rendering
42. **Sprint 42 — Tables Expansion**: tables-computed-columns (P1) + tables-cross-joins (P2) + tables-agent-charts (P2) + tables-workflow-triggers (P2) — formula engine, relation combobox, joined views, chart builder, event triggers
43. **Sprint 43 — Tables Polish**: tables-nl-creation (P3) + tables-export (P3) + tables-versioning (P3) — NL table creation, CSV/XLSX/JSON export, row-level version history with rollback

> Structured Data (Tables) initiative (14 features) fully shipped 2026-04-03. Sprints 38-43 completed. 52 new files, 13 new DB tables, 12 agent tools, 12 built-in templates.

Sprint 44 — WIP cleanup (completed 2026-04-15): runtime-validation-hardening, database-snapshot-backup, dynamic-slash-commands, profile-environment-sync all closed.

> **App Marketplace chain deferred (2026-04-13).** The 26-feature marketplace/apps chain originally planned as Sprints 44–50 was descoped as part of the community-edition pivot (commits `0436803` "remove app catalog, marketplace, and subscription tiering" and `05fe720` "reconcile roadmap with community-edition pivot"). All related specs are marked `deferred` in the tables above — see their frontmatter for authoritative status. Revisit only if the community-edition scope changes.

Browser automation chain:

```
chat-engine + agent-integration + tool-permission-persistence
                                │
                                └── browser-use
                                        ├── Chrome DevTools MCP (CDP, live Chrome)
                                        └── Playwright MCP (headless, accessibility snapshots)
```

Entity relationship chain:

```
workflow-engine + workflow-editing + document-output-generation
                                │
                                └── workflow-run-history (P1)
                                        └── entity-relationship-detail-views (P2)
                                                └── relationship-summary-cards (P2)
```

## Open Questions

- **Pricing source of truth**: Need a durable model-pricing strategy for Claude and Codex so historical usage rows preserve derived cost even if provider pricing changes later
- **Parallel workflow UX ceiling**: Need to decide how much branch configurability to expose beyond the current fork/join pattern without turning the editor into a graph builder
- **Notification channel policy**: Need to define when ainative should escalate from in-app approval toast to browser notification delivery, especially for hidden tabs

### Deferred from Vision Alignment (2026-03-31)

Items from `ideas/vision/` that are explicitly deferred — documented for future grooming:

- **MCP business tool integration** (CRM, email, Slack-as-tool, social) — largest technical investment, defer until heartbeat proves proactive value
- **Cloud sync** (Supabase/Turso) — architecture change from local-first to hybrid, defer until users need it
- **Multi-user RBAC** — requires auth system, defer until team use cases validated
- **Portfolio view** (PE operating partner use case) — depends on multi-user + cloud sync
- ~~**Agent marketplace / blueprint registry** (community)~~ → Promoted to App Marketplace initiative (26 features, 7 sprints planned)
- **API-first/headless deployment** — enterprise play
- **Voice/phone agent integration** — niche, high-effort
- **Business KPI dashboard** — depends on MCP integrations that don't exist yet
- **Gemini/DeepSeek runtime providers** — defer until Ollama proves demand
- **OpenClaw Gateway MCP bridge** — defer until OpenClaw Foundation stabilizes
- **ClawHub import bridge** — can extend skills-repo-import later
- **Workspace git export** — useful but lower leverage than proactive intelligence
- ~~**Bidirectional messaging** (Phase 2 of multi-channel-delivery) — delivery-only first~~ → Promoted to `bidirectional-channel-chat` (completed)
