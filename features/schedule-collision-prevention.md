---
title: Schedule Collision Prevention & Turn Budget Optimization
status: completed
shipped-date: 2026-05-03
priority: P1
milestone: post-mvp
source: wealth-mgr field deployment learnings
dependencies: [scheduled-prompt-loops, heartbeat-scheduler]
---

# Schedule Collision Prevention & Turn Budget Optimization

## Description

Two systemic issues emerge when users deploy multiple recurring schedules in production:

1. **Schedule collision** — Multiple schedules fire at the same instant, but only one agent slot is available. The first task claims the slot; remaining tasks queue indefinitely because nothing triggers queue drain after task completion.

2. **Turn budget exhaustion** — Agent prompts that instruct per-item processing (e.g., "for each of 32 markets, call this API") burn 1 turn per tool call, routinely exceeding the `maxTurns` limit before completing useful work.

This spec addresses both problems at the scheduler engine level, eliminating the need for users to manually stagger cron expressions or hand-optimize prompt wording.

> **Scope note.** The cap and the claim described here match
> `source_type IN ('scheduled', 'heartbeat')` only. Runs started on demand —
> manual execute, resume, chat `execute_task`, handoffs, workflow steps — have
> their own independent cap; see
> [on-demand-run-concurrency-cap](on-demand-run-concurrency-cap.md).

## Problem Evidence (Field Data)

### Schedule Collision

In a deployment with 3 schedules firing at `*/30 * * * *` (every 30 min):

| Schedule | Cron | Fire Time |
|----------|------|-----------|
| Price Monitor | `*/30 * * * *` | :00, :30 |
| Prediction Markets Monitor | `*/30 * * * *` | :00, :30 |
| News Sentinel | `0 */2 * * *` | :00 (every 2h) |

At `:00`, all three fire simultaneously. One executes; two sit in "queued" for **6+ hours** because:
- `fireSchedule()` calls `executeTaskWithRuntime()` as fire-and-forget
- After the running task completes, nothing polls the queue for waiting tasks
- The concurrency guard (`runningChildren.length > 0`) correctly prevents double-firing of the *same* schedule, but doesn't help *other* schedules whose tasks are queued

The queued tasks only execute when the *next* schedule fire happens to wake the ticker — meaning a 30-min schedule task might wait 30+ minutes after the queue clears.

### Turn Budget Exhaustion

| Failed Task | Turns Used | Max Turns | Root Cause |
|-------------|-----------|-----------|------------|
| Daily Portfolio Snapshot | 97 | 50+ | 22 individual web searches (9 holdings + 8 watchlist + 5 macro indicators) |
| Daily Briefing | 69 | 50+ | 7-section report, each section triggering multiple web searches |
| Prediction Markets Populate | 84 | 50+ | 32 individual API calls (one per market) |

The pattern: prompts that say "for each X, do Y" cause agents to execute N sequential tool calls, burning N turns. A prompt requesting 9 stock prices as 9 separate web searches uses 9 turns; the same data retrieved in 1 batched search uses 1 turn.

## User Story

As a user with multiple active schedules, I want my scheduled tasks to execute reliably without queue starvation or turn exhaustion, so that I can trust the automation to run unattended.

## Technical Approach

### Part 1: Queue Drain After Task Completion

**Problem**: `executeTaskWithRuntime()` is fire-and-forget. After a task completes, nothing checks if other tasks are waiting in the queue.

**Solution**: Add a post-completion queue drain hook that checks for queued tasks and executes the next one.

#### Option A: Post-Execution Queue Drain (Recommended)

In `scheduler.ts`, after `executeTaskWithRuntime()` resolves, check for queued tasks from other schedules and execute the next one:

```typescript
// In fireSchedule(), replace fire-and-forget with drain-aware execution:
executeTaskWithRuntime(taskId)
  .then(() => drainQueue())
  .catch((err) => {
    console.error(`[scheduler] task execution failed:`, err);
    drainQueue(); // Drain even on failure
  });

async function drainQueue(): Promise<void> {
  const [nextQueued] = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.status, "queued"),
        eq(tasks.sourceType, "scheduled")
      )
    )
    .orderBy(tasks.createdAt)
    .limit(1);

  if (nextQueued) {
    console.log(`[scheduler] draining queue → executing task ${nextQueued.id}`);
    executeTaskWithRuntime(nextQueued.id)
      .then(() => drainQueue()) // Recursive drain
      .catch(() => drainQueue());
  }
}
```

#### Option B: Automatic Cron Staggering (Complementary)

When creating a new schedule, automatically offset its cron expression to avoid collision with existing schedules:

```typescript
// In schedule creation (schedule-tools.ts or API route):
async function computeStaggeredCron(
  requestedCron: string,
  projectId: string
): Promise<string> {
  // Get all active schedules in the same project
  const existing = await db
    .select({ cron: schedules.cronExpression })
    .from(schedules)
    .where(
      and(
        eq(schedules.status, "active"),
        eq(schedules.projectId, projectId)
      )
    );

  // Parse the requested cron's minute field
  const parts = requestedCron.split(" ");
  const minuteField = parts[0];

  // Compute all occupied minutes across existing schedules
  const occupiedMinutes = new Set<number>();
  for (const s of existing) {
    const mins = expandCronMinutes(s.cron);
    mins.forEach((m) => occupiedMinutes.add(m));
  }

  // Find the requested minutes
  const requestedMinutes = expandCronMinutes(requestedCron);

  // If no collision, use as-is
  const hasCollision = requestedMinutes.some((m) => occupiedMinutes.has(m));
  if (!hasCollision) return requestedCron;

  // Find the nearest non-colliding offset
  const interval = detectInterval(requestedCron); // e.g., 30 for */30
  const offset = findMinOffset(occupiedMinutes, requestedMinutes, interval);

  // Apply offset to cron expression
  return applyCronOffset(requestedCron, offset);
}
```

**Staggering rules**:
- Minimum gap: 5 minutes between any two schedule fire times
- Prefer offsets that distribute evenly within the interval (e.g., for two `*/30` schedules: `:00/:30` and `:15/:45`)
- Log a warning when staggering is applied: `[scheduler] staggered "${name}" by ${offset}min to avoid collision`

### Part 2: Turn Budget Guidance System

**Problem**: Users write prompts that cause per-item sequential processing. Agents have no awareness of turn budgets.

**Solution**: Inject turn budget context into task descriptions at execution time, and provide prompt authoring guidance in the schedule creation UI/chat tool.

#### 2a. Automatic Turn Budget Header

In `fireSchedule()`, prepend a turn budget header to the task description before creating the child task:

```typescript
const turnBudget = await getSettingValue("runtime.maxTurns") ?? 50;
const budgetHeader = [
  `TURN BUDGET: You have ${turnBudget} turns maximum. Plan accordingly.`,
  `IMPORTANT: Batch operations to minimize turns.`,
  `- Use ONE web search with multiple keywords instead of per-item searches`,
  `- Read multiple tables in a single turn when possible`,
  `- Do NOT loop through items with individual tool calls`,
  ``,
].join("\n");

await db.insert(tasks).values({
  // ...
  description: budgetHeader + schedule.prompt,
  // ...
});
```

#### 2b. Prompt Efficiency Analyzer (Chat Tool Enhancement)

Add a `validate_schedule_prompt` check to the `create_schedule` chat tool that warns about common anti-patterns:

```typescript
function analyzePromptEfficiency(prompt: string): Warning[] {
  const warnings: Warning[] = [];

  // Detect per-item loop patterns
  const loopPatterns = [
    /for each\b/i,
    /for every\b/i,
    /one by one\b/i,
    /individually\b/i,
    /per.?(symbol|stock|item|market|ticker)/i,
    /search for .+ then search for/i,
  ];
  for (const pattern of loopPatterns) {
    if (pattern.test(prompt)) {
      warnings.push({
        type: "loop_pattern",
        message: "Prompt contains per-item processing language. Consider batching: instead of 'search for each stock price', use 'search for all stock prices in one query: AMZN GOOGL NVDA...'",
        severity: "high",
      });
      break;
    }
  }

  // Detect unbounded lists
  const listPatterns = [
    /all \d{2,} /i,  // "all 32 markets"
    /each of the \d{2,}/i,
  ];
  for (const pattern of listPatterns) {
    if (pattern.test(prompt)) {
      warnings.push({
        type: "large_list",
        message: "Prompt references a large number of items. Consider a bulk API call instead of iterating.",
        severity: "medium",
      });
      break;
    }
  }

  // Estimate minimum turns
  const webSearchCount = (prompt.match(/search|fetch|look up|check.*price/gi) || []).length;
  const tableOps = (prompt.match(/read|query|update|insert|write.*table/gi) || []).length;
  const estimatedTurns = webSearchCount + tableOps + 3; // +3 for overhead

  if (estimatedTurns > 30) {
    warnings.push({
      type: "high_turn_estimate",
      message: `Estimated ${estimatedTurns}+ turns required. Consider splitting into a multi-step workflow or batching operations.`,
      severity: "high",
    });
  }

  return warnings;
}
```

#### 2c. Batching Best Practices Documentation

Add to the schedule creation help text / chat tool description:

```
Turn Optimization Best Practices:
1. BATCH web searches: "stock prices AMZN GOOGL NVDA AAPL today" (1 turn) vs. searching each individually (N turns)
2. BATCH table reads: Read all needed tables in one sweep, not one per step
3. Use BULK APIs: One API call returning all items vs. per-item API calls
4. Set explicit turn targets: "Complete in MAX 10 turns"
5. Prefer computation over search: If data is in a table, query it — don't web-search for it
```

### Part 3: Schedule Health Monitoring

Add observability for schedule execution quality:

```typescript
// New fields on schedules table:
avgTurnsPerFiring: number     // Rolling average turns per child task
lastTurnCount: number         // Turns used by most recent firing
failureStreak: number         // Consecutive failures (reset on success)
lastFailureReason: string     // e.g., "turn_limit_exceeded", "timeout"
```

Update after each firing completes:

```typescript
async function recordFiringMetrics(scheduleId: string, taskId: string): Promise<void> {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  const [schedule] = await db.select().from(schedules).where(eq(schedules.id, scheduleId));

  const turnCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(agentLogs)
    .where(eq(agentLogs.taskId, taskId));

  const turns = turnCount[0]?.count ?? 0;
  const prevAvg = schedule.avgTurnsPerFiring ?? turns;
  const newAvg = Math.round((prevAvg * 0.7) + (turns * 0.3)); // Exponential moving average

  const isFailure = task.status === "failed";

  await db.update(schedules).set({
    lastTurnCount: turns,
    avgTurnsPerFiring: newAvg,
    failureStreak: isFailure ? (schedule.failureStreak ?? 0) + 1 : 0,
    lastFailureReason: isFailure ? detectFailureReason(task) : null,
    updatedAt: new Date(),
  }).where(eq(schedules.id, scheduleId));

  // Auto-pause after 3 consecutive failures
  if (isFailure && (schedule.failureStreak ?? 0) + 1 >= 3) {
    await db.update(schedules).set({
      status: "paused",
      updatedAt: new Date(),
    }).where(eq(schedules.id, scheduleId));

    console.warn(`[scheduler] auto-paused "${schedule.name}" after 3 consecutive failures`);
  }
}
```

## Implementation Plan

### Phase 1: Queue Drain (Critical Fix)
- Add `drainQueue()` function to `scheduler.ts`
- Wire it as `.then()` callback on `executeTaskWithRuntime()` in both `fireSchedule()` and `fireHeartbeat()`
- Add `sourceType: "heartbeat"` to drain query filter
- **Test**: Create 3 schedules with identical cron, verify all 3 execute within seconds of each other

### Phase 2: Auto-Stagger (Prevention)
- Add `computeStaggeredCron()` to schedule creation path
- Add `expandCronMinutes()` utility to `interval-parser.ts`
- Log staggering decisions for transparency
- **Test**: Create schedule with cron `*/30 * * * *` when one already exists at `*/30`, verify offset applied

### Phase 3: Turn Budget Injection (Optimization)
- Prepend turn budget header in `fireSchedule()` and `fireHeartbeat()`
- Add `analyzePromptEfficiency()` to `schedule-tools.ts`
- Surface warnings in chat when creating schedules with inefficient patterns
- **Test**: Create schedule with prompt "for each stock, search the price" — verify warning returned

### Phase 4: Health Monitoring (Observability)
- Add new columns to `schedules` table via bootstrap DDL
- Add `recordFiringMetrics()` called after task completion
- Add auto-pause on 3 consecutive failures
- Surface metrics in `list_schedules` and `get_schedule` responses
- **Test**: Simulate 3 task failures, verify auto-pause triggers

## Acceptance Criteria

- [x] Queue drain: When task A completes and task B is queued, task B starts within 5 seconds (not on next poll cycle) — `drainQueue()` at `src/lib/schedules/scheduler.ts:58-116`, wired into `fireSchedule` (line 611) and `fireHeartbeat` (line 762) `.then()` chains.
- [x] Auto-stagger: Two schedules created with `*/30 * * * *` get staggered to `:00/:30` and `:15/:45` — `computeStaggeredCron` at `src/lib/schedules/interval-parser.ts:177`, wired into the chat tool path (`src/lib/chat/tools/schedule-tools.ts:143`) and the REST API path (`src/app/api/schedules/route.ts`, added 2026-05-03).
- [x] Minimum 5-minute gap enforced between any two schedule fire times — `MIN_GAP_MINUTES = 5` constant + `hasCollision()` walks ±4 minutes around each occupied minute (`src/lib/schedules/interval-parser.ts:148, 220-229`).
- [x] Turn budget header auto-prepended to all schedule-spawned tasks — `buildTurnBudgetHeader()` at `src/lib/schedules/scheduler.ts:124`, prepended in `fireSchedule` at line 529. (Heartbeat path intentionally excluded — see Design Decisions.)
- [x] Prompt efficiency warnings surfaced for per-item loop patterns — `analyzePromptEfficiency()` at `src/lib/schedules/prompt-analyzer.ts:46`, called from `create_schedule` chat tool at `src/lib/chat/tools/schedule-tools.ts:156`. Coverage in `prompt-analyzer.test.ts` (8 cases).
- [x] Schedule health metrics (avgTurns, failureStreak) tracked and visible — `recordFiringMetrics` at `src/lib/schedules/scheduler.ts:170` writes `lastTurnCount`, `avgTurnsPerFiring` (EMA 0.7/0.3), `failureStreak`, `turnBudgetBreachStreak`, `lastFailureReason`. Persistent firing log in `scheduleFiringMetrics` table (`src/lib/db/schema.ts:1261`).
- [x] Auto-pause after 3 consecutive failures with log warning — implemented at `scheduler.ts:226-253` with separate thresholds: 3 generic failures, 5 turn-budget breaches (with first-breach grace window, see Design Decisions).
- [x] Existing schedules unaffected (backward compatible) — new schedule columns default to NULL/0 via bootstrap DDL; `drainQueue` respects existing concurrency cap; auto-stagger returns original cron when no neighbors collide.

## Design Decisions

### Why queue drain, not higher concurrency?

Running multiple agents concurrently increases cost linearly and can cause conflicts when agents write to the same tables. Sequential execution with queue drain gives predictable costs and avoids race conditions, while eliminating the starvation problem.

### Why auto-stagger at creation time, not at fire time?

Staggering at fire time (delaying execution by a random offset) adds latency to every firing. Staggering at creation time modifies the cron expression once, giving predictable fire times the user can see and adjust. It also makes the fire schedule visible in the UI — users see `15,45 * * * *` instead of `*/30 * * * *` and understand why.

### Why prepend turn budget to prompt, not enforce in runtime?

The runtime already enforces `maxTurns` — but hard-stopping an agent mid-task produces incomplete results. By telling the agent its budget upfront, it can plan its approach (batch vs. iterate) to complete within the limit. This is a soft guidance layer on top of the hard enforcement.

### Why is the heartbeat path excluded from the turn-budget header?

Heartbeat prompts (`src/lib/schedules/heartbeat-prompt.ts:27`) are structurally bounded JSON-evaluation tasks: N checklist items, one structured response. They don't have the per-item loop pathology that the field-data evidence in this spec (97/84/69 turn cases) describes. Adding the batching guidance in front of the strict JSON-response contract creates noise without addressing a real failure mode. The runtime turn limit still applies as a hard cap on heartbeats.

### Why two auto-pause streaks (`failureStreak` ≥ 3 vs. `turnBudgetBreachStreak` ≥ 5)?

A misconfigured `maxTurns` shouldn't trigger the same auto-pause as a misbehaving agent. Splitting the counter and lifting the threshold (5 vs. 3) gives users a few firings to notice the new cap is too tight before the schedule pauses. A first-breach grace window (`shouldApplyGrace` at `scheduler.ts:302`, 2× cron interval after `maxTurnsSetAt`) further forgives the first firing after a recent maxTurns edit. This is positive drift from the original spec — operational lesson learned during the field deployment that motivated this work.

## References

- `src/lib/schedules/scheduler.ts` — Core scheduler engine
- `src/lib/schedules/interval-parser.ts` — Cron parsing utilities
- `src/lib/chat/tools/schedule-tools.ts` — Schedule CRUD chat tools
- `features/scheduled-prompt-loops.md` — Base scheduling feature
- `features/heartbeat-scheduler.md` — Heartbeat extension
