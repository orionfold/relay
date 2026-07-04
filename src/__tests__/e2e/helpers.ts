/**
 * E2E test helpers — HTTP client utilities for calling ainative API endpoints.
 *
 * These helpers call the live Next.js dev/prod server. The base URL defaults
 * to http://localhost:3000 and can be overridden via E2E_BASE_URL env var.
 */

export const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

// ---------------------------------------------------------------------------
// Generic fetch wrapper
// ---------------------------------------------------------------------------

interface ApiResponse<T = unknown> {
  status: number;
  ok: boolean;
  data: T;
}

async function api<T = unknown>(
  path: string,
  options?: RequestInit
): Promise<ApiResponse<T>> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  const data = (await res.json().catch(() => null)) as T;
  return { status: res.status, ok: res.ok, data };
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export interface ProjectPayload {
  name: string;
  description?: string;
  workingDirectory?: string;
}

export async function createProject(payload: ProjectPayload) {
  return api<{ id: string; name: string }>(
    "/api/projects",
    { method: "POST", body: JSON.stringify(payload) }
  );
}

export async function deleteProject(id: string) {
  return api(`/api/projects/${id}`, { method: "DELETE" });
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export interface TaskPayload {
  title: string;
  description?: string;
  projectId?: string;
  priority?: number;
  assignedAgent?: string;
  agentProfile?: string;
}

export interface TaskRow {
  id: string;
  title: string;
  status: string;
  result: string | null;
  assignedAgent: string | null;
  agentProfile: string | null;
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function createTask(payload: TaskPayload) {
  return api<TaskRow>("/api/tasks", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getTask(id: string) {
  return api<TaskRow>(`/api/tasks/${id}`);
}

export async function updateTask(id: string, payload: Partial<TaskPayload & { status: string }>) {
  return api<TaskRow>(`/api/tasks/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteTask(id: string) {
  return api(`/api/tasks/${id}`, { method: "DELETE" });
}

export async function executeTask(id: string) {
  return api<{ message: string }>(`/api/tasks/${id}/execute`, {
    method: "POST",
  });
}

// ---------------------------------------------------------------------------
// Workflows
// ---------------------------------------------------------------------------

export interface WorkflowStep {
  id: string;
  name: string;
  prompt: string;
  requiresApproval?: boolean;
  dependsOn?: string[];
  assignedAgent?: string;
  agentProfile?: string;
}

export interface WorkflowPayload {
  name: string;
  projectId?: string;
  definition: {
    pattern: string;
    steps: WorkflowStep[];
  };
}

export interface WorkflowRow {
  id: string;
  name: string;
  status: string;
  definition: string;
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function createWorkflow(payload: WorkflowPayload) {
  return api<WorkflowRow>("/api/workflows", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getWorkflow(id: string) {
  return api<WorkflowRow>(`/api/workflows/${id}`);
}

export async function executeWorkflow(id: string) {
  return api<{ status: string; workflowId: string }>(
    `/api/workflows/${id}/execute`,
    { method: "POST" }
  );
}

// ---------------------------------------------------------------------------
// Blueprints
// ---------------------------------------------------------------------------

export async function listBlueprints() {
  return api<unknown[]>("/api/blueprints");
}

export async function instantiateBlueprint(
  blueprintId: string,
  variables: Record<string, string>,
  projectId?: string
) {
  return api<{ workflow: WorkflowRow }>(
    `/api/blueprints/${blueprintId}/instantiate`,
    {
      method: "POST",
      body: JSON.stringify({ variables, projectId }),
    }
  );
}

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

export async function listProfiles() {
  return api<unknown[]>("/api/agents");
}

// ---------------------------------------------------------------------------
// Runtime connectivity
// ---------------------------------------------------------------------------

export async function checkRuntimeConnectivity(runtimeId: string) {
  return api<{ connected: boolean; method?: string }>(
    `/api/settings/connectivity?runtime=${runtimeId}`
  );
}

// ---------------------------------------------------------------------------
// Polling helpers
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 3_000;
const DEFAULT_TIMEOUT_MS = 120_000;

const TERMINAL_TASK_STATUSES = new Set([
  "completed",
  "failed",
  "cancelled",
]);

const TERMINAL_WORKFLOW_STATUSES = new Set([
  "completed",
  "failed",
  "cancelled",
]);

export async function pollTaskUntilDone(
  taskId: string,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<TaskRow> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { data } = await getTask(taskId);
    if (data && TERMINAL_TASK_STATUSES.has(data.status)) {
      return data;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(
    `Task ${taskId} did not reach a terminal status within ${timeoutMs}ms`
  );
}

export async function pollWorkflowUntilDone(
  workflowId: string,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<WorkflowRow> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { data } = await getWorkflow(workflowId);
    if (data && TERMINAL_WORKFLOW_STATUSES.has(data.status)) {
      return data;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(
    `Workflow ${workflowId} did not reach a terminal status within ${timeoutMs}ms`
  );
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if a runtime is available by calling the connectivity endpoint.
 * Returns true if the runtime responds as connected.
 */
export async function isRuntimeAvailable(
  runtimeId: string
): Promise<boolean> {
  try {
    const { ok, data } = await checkRuntimeConnectivity(runtimeId);
    return ok && !!data?.connected;
  } catch {
    return false;
  }
}

/**
 * Check if the ainative server is reachable.
 */
export async function isServerReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/api/projects`);
    return res.ok;
  } catch {
    return false;
  }
}
