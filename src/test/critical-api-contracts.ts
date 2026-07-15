export type CriticalApiRisk = "tier-0" | "tier-1";
export type CriticalApiFamily =
  | "task"
  | "workflow"
  | "schedule"
  | "chat"
  | "runtime";
export type CriticalApiMethod = "GET" | "POST" | "PUT" | "PATCH";

export interface CriticalApiRouteContract {
  id: string;
  family: CriticalApiFamily;
  routeFile: string;
  method: CriticalApiMethod;
  risk: CriticalApiRisk;
  mutationOrSideEffect: string;
  validationBoundary: string;
  persistenceOrDispatchBoundary: string;
  terminalOutcomes: readonly string[];
  guards: readonly string[];
}

/**
 * G-070's deliberately bounded Tier-0/Tier-1 route tranche.
 *
 * Keep this test-side: it is quality governance, not a second production
 * router. The executable inventory test proves that every named handler and
 * guard exists and that no route/method pair is duplicated.
 */
export const CRITICAL_API_ROUTE_CONTRACTS = [
  {
    id: "task-create",
    family: "task",
    routeFile: "src/app/api/tasks/route.ts",
    method: "POST",
    risk: "tier-0",
    mutationOrSideEffect: "Insert one planned task and optional document links",
    validationBoundary: "createTaskSchema plus runtime/profile compatibility",
    persistenceOrDispatchBoundary: "tasks and documents SQLite rows",
    terminalOutcomes: ["201 created", "400 invalid_json_or_input"],
    guards: ["src/app/api/tasks/__tests__/route-contract.test.ts"],
  },
  {
    id: "task-execute",
    family: "task",
    routeFile: "src/app/api/tasks/[id]/execute/route.ts",
    method: "POST",
    risk: "tier-0",
    mutationOrSideEffect: "Atomically claim queued task and launch dispatch",
    validationBoundary: "task state, budget, execution target, profile capability",
    persistenceOrDispatchBoundary: "guarded tasks update before startTaskExecution",
    terminalOutcomes: ["202 started", "404 missing", "409 target_or_claim_refused"],
    guards: ["src/app/api/tasks/[id]/execute/__tests__/route.test.ts"],
  },
  {
    id: "task-resume",
    family: "task",
    routeFile: "src/app/api/tasks/[id]/resume/route.ts",
    method: "POST",
    risk: "tier-0",
    mutationOrSideEffect: "Atomically claim resumable task and launch resume",
    validationBoundary: "session, resume limit, state, budget, exact runtime target",
    persistenceOrDispatchBoundary: "tasks claim/rollback before resumeTaskExecution",
    terminalOutcomes: ["202 started", "404 missing", "400 invalid_or_refused", "429 budget"],
    guards: ["src/app/api/tasks/[id]/resume/__tests__/route.test.ts"],
  },
  {
    id: "task-cancel",
    family: "task",
    routeFile: "src/app/api/tasks/[id]/cancel/route.ts",
    method: "POST",
    risk: "tier-0",
    mutationOrSideEffect: "Cancel provider execution and persist cancelled task",
    validationBoundary: "task existence and runtime cancellation capability",
    persistenceOrDispatchBoundary: "cancelTaskWithRuntime adapter and tasks row",
    terminalOutcomes: ["200 cancelled", "404 missing", "409 cancellation_refused"],
    guards: ["src/app/api/tasks/[id]/cancel/__tests__/route.test.ts"],
  },
  {
    id: "workflow-execute",
    family: "workflow",
    routeFile: "src/app/api/workflows/[id]/execute/route.ts",
    method: "POST",
    risk: "tier-0",
    mutationOrSideEffect: "Atomically claim one workflow run and dispatch engine",
    validationBoundary: "workflow state and every step execution target",
    persistenceOrDispatchBoundary: "workflows plus workflowReceiptRuns transaction",
    terminalOutcomes: ["202 started", "404 missing", "409 target_or_duplicate"],
    guards: ["src/app/api/workflows/[id]/execute/__tests__/route.test.ts"],
  },
  {
    id: "schedule-execute",
    family: "schedule",
    routeFile: "src/app/api/schedules/[id]/execute/route.ts",
    method: "POST",
    risk: "tier-0",
    mutationOrSideEffect: "Create/claim child task and optionally audit force bypass",
    validationBoundary: "schedule existence and atomic concurrency slot",
    persistenceOrDispatchBoundary: "tasks/usageLedger before startTaskExecution",
    terminalOutcomes: ["200 fired", "404 missing", "429 capacity_full"],
    guards: ["src/app/api/schedules/__tests__/execute-route.test.ts"],
  },
  {
    id: "schedule-control",
    family: "schedule",
    routeFile: "src/app/api/schedules/[id]/route.ts",
    method: "PATCH",
    risk: "tier-1",
    mutationOrSideEffect: "Pause, resume, or update schedule configuration",
    validationBoundary: "Zod body, transition, interval, runtime/profile compatibility",
    persistenceOrDispatchBoundary: "schedules SQLite row",
    terminalOutcomes: ["200 updated", "400 invalid_input", "404 missing", "409 invalid_transition"],
    guards: ["src/app/api/schedules/[id]/__tests__/route.test.ts"],
  },
  {
    id: "chat-message-stream",
    family: "chat",
    routeFile: "src/app/api/chat/conversations/[id]/messages/route.ts",
    method: "POST",
    risk: "tier-0",
    mutationOrSideEffect: "Stream and durably finalize one Chat turn",
    validationBoundary: "JSON content and conversation existence",
    persistenceOrDispatchBoundary: "sendMessage plus SSE first-terminal contract",
    terminalOutcomes: ["200 SSE done_or_error", "400 invalid_input", "404 missing"],
    guards: [
      "src/app/api/chat/conversations/[id]/messages/__tests__/route-sse-contract.test.ts",
      "src/app/api/chat/conversations/[id]/messages/__tests__/route-termination.test.ts",
    ],
  },
  {
    id: "chat-permission-respond",
    family: "chat",
    routeFile: "src/app/api/chat/conversations/[id]/respond/route.ts",
    method: "POST",
    risk: "tier-0",
    mutationOrSideEffect: "Resolve pending gate and persist message/permission state",
    validationBoundary: "Zod response body, conversation and message ownership",
    persistenceOrDispatchBoundary: "permission bridge, chatMessages, settings",
    terminalOutcomes: ["200 resolved_or_stale", "400 invalid_input", "404 ownership"],
    guards: ["src/app/api/chat/conversations/[id]/respond/__tests__/route.test.ts"],
  },
  {
    id: "ollama-runtime-probe",
    family: "runtime",
    routeFile: "src/app/api/runtimes/ollama/route.ts",
    method: "GET",
    risk: "tier-1",
    mutationOrSideEffect: "Discover models from configured Ollama endpoint",
    validationBoundary: "configured endpoint and upstream HTTP/JSON response",
    persistenceOrDispatchBoundary: "server-side fetch only",
    terminalOutcomes: ["200 models", "502 upstream_or_transport"],
    guards: ["src/app/api/runtimes/ollama/__tests__/route.test.ts"],
  },
  {
    id: "ollama-runtime-pull",
    family: "runtime",
    routeFile: "src/app/api/runtimes/ollama/route.ts",
    method: "POST",
    risk: "tier-1",
    mutationOrSideEffect: "Pull one model through the configured Ollama endpoint",
    validationBoundary: "strict action/model body plus configured endpoint policy",
    persistenceOrDispatchBoundary: "authenticated upstream pull and discovery-cache invalidation",
    terminalOutcomes: ["200 completed", "400 invalid_input", "502 upstream_or_transport"],
    guards: ["src/app/api/runtimes/ollama/__tests__/route.test.ts"],
  },
  {
    id: "compatible-runtime-probe",
    family: "runtime",
    routeFile: "src/app/api/runtimes/openai-compatible/[runtimeId]/route.ts",
    method: "GET",
    risk: "tier-1",
    mutationOrSideEffect: "Discover models for the selected compatible runtime",
    validationBoundary: "litellm/lmstudio path allow-list",
    persistenceOrDispatchBoundary: "listOpenAICompatibleModels transport",
    terminalOutcomes: ["200 models", "404 invalid_runtime", "502 upstream"],
    guards: [
      "src/app/api/runtimes/openai-compatible/[runtimeId]/__tests__/route.test.ts",
    ],
  },
  {
    id: "runtime-connection-test",
    family: "runtime",
    routeFile: "src/app/api/settings/test/route.ts",
    method: "POST",
    risk: "tier-1",
    mutationOrSideEffect: "Run health check for exact requested/default runtime",
    validationBoundary: "Zod JSON body and runtime catalog resolution",
    persistenceOrDispatchBoundary: "testRuntimeConnection adapter",
    terminalOutcomes: ["200 connected_or_readable_failure", "400 invalid_json_or_shape"],
    guards: ["src/app/api/settings/test/__tests__/route.test.ts"],
  },
  {
    id: "compatible-runtime-download",
    family: "runtime",
    routeFile: "src/app/api/runtimes/openai-compatible/[runtimeId]/route.ts",
    method: "POST",
    risk: "tier-1",
    mutationOrSideEffect: "Start one LM Studio model download",
    validationBoundary: "runtime allow-list plus strict action/model body",
    persistenceOrDispatchBoundary: "authenticated LM Studio management request",
    terminalOutcomes: ["200 download_status", "400 unsupported_or_invalid", "502 upstream"],
    guards: [
      "src/app/api/runtimes/openai-compatible/[runtimeId]/__tests__/route.test.ts",
    ],
  },
  {
    id: "ollama-settings-update",
    family: "runtime",
    routeFile: "src/app/api/settings/ollama/route.ts",
    method: "PUT",
    risk: "tier-1",
    mutationOrSideEffect: "Persist redacted Ollama endpoint, model, consent, and optional credential",
    validationBoundary: "strict Zod body plus effective endpoint security policy before writes",
    persistenceOrDispatchBoundary: "settings SQLite rows and discovery-cache invalidation",
    terminalOutcomes: ["200 redacted_settings", "400 invalid_or_insecure", "500 persistence"],
    guards: ["src/app/api/settings/ollama/__tests__/route.test.ts"],
  },
  {
    id: "compatible-settings-update",
    family: "runtime",
    routeFile: "src/app/api/settings/openai-compatible/[runtimeId]/route.ts",
    method: "PUT",
    risk: "tier-1",
    mutationOrSideEffect: "Persist one compatible runtime endpoint, model, consent, and optional credential",
    validationBoundary: "runtime allow-list, strict body, effective endpoint policy before writes",
    persistenceOrDispatchBoundary: "settings SQLite rows and discovery-cache invalidation",
    terminalOutcomes: ["200 redacted_settings", "400 invalid_or_insecure", "404 runtime"],
    guards: [
      "src/app/api/settings/openai-compatible/[runtimeId]/__tests__/route.test.ts",
    ],
  },
] as const satisfies readonly CriticalApiRouteContract[];
