import { describe, expect, it } from "vitest";
import type { AppManifest } from "@/lib/apps/registry";
import {
  hasBoolean,
  hasCountLike,
  hasCurrency,
  hasDate,
  hasMessageShape,
  hasNotificationShape,
  hasStatusLike,
  pickKit,
  rule1_ledger,
  rule2_tracker,
  rule3_research,
  rule4_coach,
  rule5_inbox,
  rule6_multiBlueprint,
} from "../inference";
import type { ColumnSchemaRef } from "../types";

function makeManifest(over: Partial<AppManifest> = {}): AppManifest {
  return {
    id: "x",
    name: "X",
    profiles: [],
    blueprints: [],
    tables: [],
    schedules: [],
    ...over,
  } as AppManifest;
}

function cols(tableId: string, columns: ColumnSchemaRef["columns"]): ColumnSchemaRef[] {
  return [{ tableId, columns }];
}

describe("column-shape probes", () => {
  it("hasCurrency: matches semantic=currency", () => {
    expect(hasCurrency([{ name: "x", semantic: "currency" }])).toBe(true);
  });
  it("hasCurrency: matches name patterns", () => {
    expect(hasCurrency([{ name: "amount" }])).toBe(true);
    expect(hasCurrency([{ name: "balance_usd" }])).toBe(true);
    expect(hasCurrency([{ name: "monthly_revenue" }])).toBe(true);
  });
  it("hasCurrency: ignores neutral columns", () => {
    expect(hasCurrency([{ name: "ticker" }, { name: "qty" }])).toBe(false);
  });

  it("hasDate: matches type=date and date-shaped names", () => {
    expect(hasDate([{ name: "x", type: "date" }])).toBe(true);
    expect(hasDate([{ name: "start_date" }])).toBe(true);
    expect(hasDate([{ name: "created_at" }])).toBe(true);
  });
  it("hasDate: ignores neutral columns", () => {
    expect(hasDate([{ name: "title" }, { name: "qty" }])).toBe(false);
  });

  it("hasBoolean: matches type=boolean and boolean-shaped names", () => {
    expect(hasBoolean([{ name: "x", type: "boolean" }])).toBe(true);
    expect(hasBoolean([{ name: "active" }])).toBe(true);
    expect(hasBoolean([{ name: "completed" }])).toBe(true);
    expect(hasBoolean([{ name: "is_done" }])).toBe(true);
  });
  it("hasBoolean: ignores neutral columns", () => {
    expect(hasBoolean([{ name: "title" }, { name: "amount" }])).toBe(false);
  });

  it("hasNotificationShape: matches semantic=notification", () => {
    expect(hasNotificationShape([{ name: "x", semantic: "notification" }])).toBe(true);
  });
  it("hasNotificationShape: matches name patterns", () => {
    expect(hasNotificationShape([{ name: "read" }])).toBe(true);
    expect(hasNotificationShape([{ name: "unread" }])).toBe(true);
    expect(hasNotificationShape([{ name: "seen" }])).toBe(true);
    expect(hasNotificationShape([{ name: "is_read" }])).toBe(true);
    expect(hasNotificationShape([{ name: "delivered_at" }])).toBe(false);
    expect(hasNotificationShape([{ name: "notified" }])).toBe(true);
  });
  it("hasNotificationShape: ignores neutral columns", () => {
    expect(hasNotificationShape([{ name: "title" }, { name: "amount" }])).toBe(false);
  });
  it("hasNotificationShape: does NOT match substrings inside larger words", () => {
    expect(hasNotificationShape([{ name: "ready_state" }])).toBe(false);
    expect(hasNotificationShape([{ name: "spreadsheet" }])).toBe(false);
  });

  it("hasMessageShape: matches semantic=message-body", () => {
    expect(hasMessageShape([{ name: "x", semantic: "message-body" }])).toBe(true);
  });
  it("hasMessageShape: matches name patterns", () => {
    expect(hasMessageShape([{ name: "body" }])).toBe(true);
    expect(hasMessageShape([{ name: "message" }])).toBe(true);
    expect(hasMessageShape([{ name: "subject" }])).toBe(true);
    expect(hasMessageShape([{ name: "summary" }])).toBe(true);
    expect(hasMessageShape([{ name: "draft_body" }])).toBe(true);
    expect(hasMessageShape([{ name: "email_subject" }])).toBe(true);
  });
  it("hasMessageShape: ignores neutral columns", () => {
    expect(hasMessageShape([{ name: "title" }, { name: "qty" }])).toBe(false);
  });
  it("hasMessageShape: does NOT match substrings inside larger words", () => {
    expect(hasMessageShape([{ name: "embodied" }])).toBe(false);
    expect(hasMessageShape([{ name: "anybody" }])).toBe(false);
  });

  it("hasStatusLike: matches semantic=status", () => {
    expect(hasStatusLike([{ name: "x", semantic: "status" }])).toBe(true);
  });
  it("hasStatusLike: matches name patterns", () => {
    expect(hasStatusLike([{ name: "status" }])).toBe(true);
    expect(hasStatusLike([{ name: "state" }])).toBe(true);
    expect(hasStatusLike([{ name: "stage" }])).toBe(true);
    expect(hasStatusLike([{ name: "phase" }])).toBe(true);
    expect(hasStatusLike([{ name: "campaign_status" }])).toBe(true);
    expect(hasStatusLike([{ name: "pipeline_stage" }])).toBe(true);
  });
  it("hasStatusLike: ignores neutral columns", () => {
    expect(hasStatusLike([{ name: "title" }, { name: "amount" }])).toBe(false);
  });
  it("hasStatusLike: does NOT match substrings inside larger words", () => {
    expect(hasStatusLike([{ name: "statesman" }])).toBe(false);
    expect(hasStatusLike([{ name: "phaser" }])).toBe(false);
    expect(hasStatusLike([{ name: "stagehand" }])).toBe(false);
  });

  it("hasCountLike: matches semantic=count", () => {
    expect(hasCountLike([{ name: "x", semantic: "count" }])).toBe(true);
  });
  it("hasCountLike: matches name patterns", () => {
    expect(hasCountLike([{ name: "count" }])).toBe(true);
    expect(hasCountLike([{ name: "total" }])).toBe(true);
    expect(hasCountLike([{ name: "engagement_count" }])).toBe(true);
    expect(hasCountLike([{ name: "total_views" }])).toBe(true);
  });
  it("hasCountLike: ignores neutral columns", () => {
    expect(hasCountLike([{ name: "title" }, { name: "amount" }])).toBe(false);
  });
  it("hasCountLike: does NOT match substrings inside larger words", () => {
    expect(hasCountLike([{ name: "discount" }])).toBe(false);
    expect(hasCountLike([{ name: "subtotal" }])).toBe(false);
    expect(hasCountLike([{ name: "accountable" }])).toBe(false);
  });
});

describe("column-shape probes — tiered match precedence", () => {
  it("hasCurrency: explicit semantic wins regardless of name", () => {
    expect(hasCurrency([{ name: "wibble", semantic: "currency" }])).toBe(true);
  });
  it("hasCurrency: name pattern wins when semantic is unset", () => {
    expect(hasCurrency([{ name: "monthly_revenue" }])).toBe(true);
  });
  it("hasCurrency: neither tier hits → false", () => {
    expect(hasCurrency([{ name: "wibble" }])).toBe(false);
  });
  it("hasDate: type=date wins regardless of semantic/name", () => {
    expect(hasDate([{ name: "wibble", type: "date" }])).toBe(true);
    expect(hasDate([{ name: "wibble", type: "datetime" }])).toBe(true);
  });
  it("hasDate: explicit semantic wins when type is unset", () => {
    expect(hasDate([{ name: "wibble", semantic: "date" }])).toBe(true);
  });
  it("hasBoolean: type=boolean wins regardless of name", () => {
    expect(hasBoolean([{ name: "wibble", type: "boolean" }])).toBe(true);
  });
});

describe("decision table — per-rule negative near-misses", () => {
  it("rule1_ledger: currency on a non-hero table does not fire", () => {
    const m = makeManifest({
      tables: [{ id: "t-hero" }, { id: "t-side" }],
      blueprints: [{ id: "bp" }],
    });
    expect(
      rule1_ledger(m, [
        { tableId: "t-hero", columns: [{ name: "title" }] },
        { tableId: "t-side", columns: [{ name: "amount" }] },
      ])
    ).toBe(false);
  });

  it("rule2_tracker: date without boolean does not fire", () => {
    const m = makeManifest({
      tables: [{ id: "t1" }],
      schedules: [{ id: "s" }],
    });
    expect(rule2_tracker(m, cols("t1", [{ name: "start_date" }]))).toBe(false);
  });

  it("rule2_tracker: boolean without date does not fire", () => {
    const m = makeManifest({
      tables: [{ id: "t1" }],
      schedules: [{ id: "s" }],
    });
    expect(rule2_tracker(m, cols("t1", [{ name: "completed" }]))).toBe(false);
  });

  it("rule3_research: schedule + 'process-rows' blueprint does not fire", () => {
    const m = makeManifest({
      blueprints: [{ id: "process-rows" }],
      schedules: [{ id: "s" }],
    });
    expect(rule3_research(m)).toBe(false);
  });

  it("rule4_coach: schedule + 'researcher' profile does not fire", () => {
    const m = makeManifest({
      profiles: [{ id: "researcher" }],
      schedules: [{ id: "s", runs: "profile:researcher" }],
    });
    expect(rule4_coach(m)).toBe(false);
  });

  it("rule5_inbox: blueprint 'weekly-review' does not fire on shape alone (no schemas)", () => {
    const m = makeManifest({ blueprints: [{ id: "weekly-review" }] });
    expect(rule5_inbox(m)).toBe(false);
  });

  it("rule6_multiBlueprint: 2 blueprints WITH hero table does not fire", () => {
    const m = makeManifest({
      blueprints: [{ id: "a" }, { id: "b" }],
      tables: [{ id: "t1" }],
    });
    expect(rule6_multiBlueprint(m)).toBe(false);
  });
});

describe("rule1_ledger — currency + date hero + ≥1 blueprint", () => {
  it("fires when hero table has currency + date AND ≥1 blueprint", () => {
    const m = makeManifest({
      tables: [{ id: "t1" }],
      blueprints: [{ id: "bp" }],
    });
    expect(
      rule1_ledger(m, cols("t1", [{ name: "amount" }, { name: "date" }]))
    ).toBe(true);
  });
  it("does not fire without a blueprint", () => {
    const m = makeManifest({ tables: [{ id: "t1" }] });
    expect(
      rule1_ledger(m, cols("t1", [{ name: "amount" }, { name: "date" }]))
    ).toBe(false);
  });
  it("does not fire without a currency column", () => {
    const m = makeManifest({
      tables: [{ id: "t1" }],
      blueprints: [{ id: "bp" }],
    });
    expect(rule1_ledger(m, cols("t1", [{ name: "title" }]))).toBe(false);
  });
  it("does not fire when no tables exist", () => {
    expect(rule1_ledger(makeManifest({ blueprints: [{ id: "bp" }] }), [])).toBe(false);
  });
  it("does not fire when currency present but date missing (snapshot shape)", () => {
    const m = makeManifest({
      tables: [{ id: "t1" }],
      blueprints: [{ id: "bp" }],
    });
    expect(
      rule1_ledger(
        m,
        cols("t1", [
          { name: "ticker" },
          { name: "cost_basis" },
          { name: "current_price" },
          { name: "market_value" },
        ])
      )
    ).toBe(false);
  });
  it("does not fire when date present but currency missing", () => {
    const m = makeManifest({
      tables: [{ id: "t1" }],
      blueprints: [{ id: "bp" }],
    });
    expect(rule1_ledger(m, cols("t1", [{ name: "date" }]))).toBe(false);
  });
});

describe("rule2_tracker — date + (bool|rating|status|count) hero + ≥1 schedule", () => {
  it("fires when hero table has boolean+date AND ≥1 schedule", () => {
    const m = makeManifest({
      tables: [{ id: "t1" }],
      schedules: [{ id: "s" }],
    });
    expect(
      rule2_tracker(m, cols("t1", [{ name: "completed" }, { name: "date" }]))
    ).toBe(true);
  });
  it("does not fire without a schedule", () => {
    const m = makeManifest({ tables: [{ id: "t1" }] });
    expect(
      rule2_tracker(m, cols("t1", [{ name: "completed" }, { name: "date" }]))
    ).toBe(false);
  });
  it("does not fire without a boolean column", () => {
    const m = makeManifest({
      tables: [{ id: "t1" }],
      schedules: [{ id: "s" }],
    });
    expect(rule2_tracker(m, cols("t1", [{ name: "date" }]))).toBe(false);
  });
  it("fires when hero has date + status-like column (campaign tracker shape)", () => {
    const m = makeManifest({
      tables: [{ id: "t1" }],
      schedules: [{ id: "s" }],
    });
    expect(
      rule2_tracker(m, cols("t1", [{ name: "publish_date" }, { name: "status" }]))
    ).toBe(true);
  });
  it("fires when hero has date + count-like column (engagement tracker shape)", () => {
    const m = makeManifest({
      tables: [{ id: "t1" }],
      schedules: [{ id: "s" }],
    });
    expect(
      rule2_tracker(
        m,
        cols("t1", [{ name: "date" }, { name: "engagement_count" }])
      )
    ).toBe(true);
  });
  it("still does not fire on date alone (no progress signal)", () => {
    const m = makeManifest({
      tables: [{ id: "t1" }],
      schedules: [{ id: "s" }],
    });
    expect(
      rule2_tracker(m, cols("t1", [{ name: "date" }, { name: "title" }]))
    ).toBe(false);
  });
});

describe("rule3_research — schedule + digest/report blueprint", () => {
  it("fires when blueprint id matches digest/report and schedule exists", () => {
    const m = makeManifest({
      blueprints: [{ id: "weekly-digest" }],
      schedules: [{ id: "s" }],
    });
    expect(rule3_research(m)).toBe(true);
  });
  it("does not fire without schedule", () => {
    const m = makeManifest({ blueprints: [{ id: "weekly-digest" }] });
    expect(rule3_research(m)).toBe(false);
  });
  it("does not fire when blueprint has no document signals", () => {
    const m = makeManifest({
      blueprints: [{ id: "process-rows" }],
      schedules: [{ id: "s" }],
    });
    expect(rule3_research(m)).toBe(false);
  });
});

describe("rule4_coach — schedule + *-coach profile", () => {
  it("fires when a profile id ends in -coach AND schedule exists", () => {
    const m = makeManifest({
      profiles: [{ id: "habit-tracker--habit-coach" }],
      schedules: [{ id: "s" }],
    });
    expect(rule4_coach(m)).toBe(true);
  });
  it("fires when a schedule.runs targets a *-coach profile", () => {
    const m = makeManifest({
      profiles: [],
      schedules: [{ id: "s", runs: "profile:portfolio-coach" }],
    });
    expect(rule4_coach(m)).toBe(true);
  });
  it("does not fire without schedule", () => {
    const m = makeManifest({ profiles: [{ id: "x--coach" }] });
    expect(rule4_coach(m)).toBe(false);
  });
  it("does not fire when no coach signals are present", () => {
    const m = makeManifest({
      profiles: [{ id: "researcher" }],
      schedules: [{ id: "s" }],
    });
    expect(rule4_coach(m)).toBe(false);
  });
});

describe("rule5_inbox — drafter / follow-up / inbox blueprint", () => {
  it("fires when blueprint id matches drafter/inbox/follow-up/notification", () => {
    expect(rule5_inbox(makeManifest({ blueprints: [{ id: "follow-up-drafter" }] }))).toBe(true);
    expect(rule5_inbox(makeManifest({ blueprints: [{ id: "inbox-triage" }] }))).toBe(true);
    expect(rule5_inbox(makeManifest({ blueprints: [{ id: "notification-router" }] }))).toBe(true);
  });
  it("does not fire when no inbox signals", () => {
    expect(rule5_inbox(makeManifest({ blueprints: [{ id: "weekly-review" }] }))).toBe(false);
  });
  it("fires when hero has notification+message shape (no inbox blueprint id)", () => {
    const m = makeManifest({
      blueprints: [{ id: "process-rows" }],
      tables: [{ id: "t1" }],
    });
    expect(
      rule5_inbox(
        m,
        cols("t1", [{ name: "subject" }, { name: "body" }, { name: "read" }])
      )
    ).toBe(true);
  });
  it("does not fire on shape alone when only message shape present (no notification)", () => {
    const m = makeManifest({
      blueprints: [{ id: "process-rows" }],
      tables: [{ id: "t1" }],
    });
    expect(rule5_inbox(m, cols("t1", [{ name: "summary" }]))).toBe(false);
  });
  it("does not fire on shape alone when only notification shape present (no message)", () => {
    const m = makeManifest({
      blueprints: [{ id: "process-rows" }],
      tables: [{ id: "t1" }],
    });
    expect(rule5_inbox(m, cols("t1", [{ name: "read" }]))).toBe(false);
  });
  it("blueprint-id path still wins regardless of shape", () => {
    const m = makeManifest({ blueprints: [{ id: "follow-up-drafter" }] });
    expect(rule5_inbox(m, [])).toBe(true);
  });
});

describe("rule6_multiBlueprint — ≥2 blueprints, no clear hero table", () => {
  it("fires when ≥2 blueprints AND 0 tables", () => {
    expect(
      rule6_multiBlueprint(makeManifest({ blueprints: [{ id: "a" }, { id: "b" }] }))
    ).toBe(true);
  });
  it("does not fire with 1 blueprint", () => {
    expect(
      rule6_multiBlueprint(makeManifest({ blueprints: [{ id: "a" }], tables: [] }))
    ).toBe(false);
  });
});

describe("pickKit — explicit declaration overrides inference", () => {
  it("returns the declared kit when view.kit is set and not 'auto'", () => {
    const m = {
      ...makeManifest(),
      view: { kit: "ledger" as const, bindings: {}, hideManifestPane: false },
    };
    expect(pickKit(m, [])).toBe("ledger");
  });
  it("falls through to inference when view.kit is 'auto'", () => {
    const m = {
      ...makeManifest({ blueprints: [{ id: "a" }, { id: "b" }] }),
      view: { kit: "auto" as const, bindings: {}, hideManifestPane: false },
    };
    expect(pickKit(m, [])).toBe("workflow-hub");
  });
  it("falls through to inference when view is omitted entirely", () => {
    const m = makeManifest({ blueprints: [{ id: "a" }, { id: "b" }] });
    expect(pickKit(m, [])).toBe("workflow-hub");
  });
});

describe("pickKit — first-match-wins decision table", () => {
  it("ledger wins when both ledger and tracker would otherwise match", () => {
    const m = makeManifest({
      tables: [{ id: "t1" }],
      blueprints: [{ id: "bp" }],
      schedules: [{ id: "s" }],
    });
    // hero has currency AND boolean+date — rule 1 (ledger) fires first
    expect(
      pickKit(
        m,
        cols("t1", [{ name: "amount" }, { name: "completed" }, { name: "date" }])
      )
    ).toBe("ledger");
  });
  it("tracker wins over coach when both could fire", () => {
    const m = makeManifest({
      tables: [{ id: "t1" }],
      profiles: [{ id: "habit-coach" }],
      schedules: [{ id: "s" }],
    });
    expect(pickKit(m, cols("t1", [{ name: "completed" }, { name: "date" }]))).toBe(
      "tracker"
    );
  });
  it("returns workflow-hub as fallback when no rule matches", () => {
    expect(pickKit(makeManifest(), [])).toBe("workflow-hub");
  });
  it("ledger wins over inbox when both could fire", () => {
    const m = makeManifest({
      tables: [{ id: "t1" }],
      blueprints: [{ id: "bp" }],
    });
    expect(
      pickKit(
        m,
        cols("t1", [
          { name: "amount" },
          { name: "date" },
          { name: "subject" },
          { name: "body" },
          { name: "read" },
        ])
      )
    ).toBe("ledger");
  });
  it("research wins over coach when both could fire", () => {
    const m = makeManifest({
      profiles: [{ id: "weekly-coach" }],
      blueprints: [{ id: "weekly-digest" }],
      schedules: [{ id: "s" }],
    });
    expect(pickKit(m, [])).toBe("research");
  });
  it("inbox wins over multi-blueprint hub when both could fire", () => {
    const m = makeManifest({
      blueprints: [{ id: "follow-up-drafter" }, { id: "weekly-review" }],
      tables: [],
    });
    expect(pickKit(m, [])).toBe("inbox");
  });
  it("coach wins over inbox-shape when both could fire", () => {
    const m = makeManifest({
      profiles: [{ id: "support-coach" }],
      schedules: [{ id: "s" }],
      tables: [{ id: "t1" }],
      blueprints: [{ id: "process-rows" }],
    });
    expect(
      pickKit(
        m,
        cols("t1", [{ name: "subject" }, { name: "body" }, { name: "read" }])
      )
    ).toBe("coach");
  });
});

describe("pickKit — workflow-hub fallback (no rule matches)", () => {
  it("empty manifest falls through to workflow-hub", () => {
    expect(pickKit(makeManifest(), [])).toBe("workflow-hub");
  });
  it("manifest with only profiles falls through", () => {
    expect(pickKit(makeManifest({ profiles: [{ id: "x" }] }), [])).toBe("workflow-hub");
  });
  it("manifest with only one blueprint and no schedules/tables falls through", () => {
    expect(
      pickKit(makeManifest({ blueprints: [{ id: "lonely" }] }), [])
    ).toBe("workflow-hub");
  });
});

describe("pickKit — starter intent fixtures (acceptance criteria)", () => {
  it("habit-tracker → tracker", () => {
    const m = makeManifest({
      id: "habit-tracker",
      profiles: [{ id: "habit-tracker--habit-coach" }],
      blueprints: [{ id: "habit-tracker--weekly-review" }],
      tables: [{ id: "t-habits" }, { id: "t-entries" }],
      schedules: [{ id: "s", cron: "0 20 * * *" }],
    });
    const colMap: ColumnSchemaRef[] = [
      {
        tableId: "t-habits",
        columns: [
          { name: "habit" }, { name: "category" }, { name: "frequency" },
          { name: "current_streak" }, { name: "best_streak" },
          { name: "start_date" }, { name: "active" },
        ],
      },
      {
        tableId: "t-entries",
        columns: [
          { name: "date" }, { name: "habit" }, { name: "completed" },
          { name: "difficulty" }, { name: "notes" }, { name: "mood" },
        ],
      },
    ];
    expect(pickKit(m, colMap)).toBe("tracker");
  });

  it("weekly-portfolio-check-in → coach", () => {
    const m = makeManifest({
      id: "weekly-portfolio-check-in",
      profiles: [{ id: "portfolio-coach" }],
      blueprints: [{ id: "weekly-review" }],
      tables: [{ id: "t-pos" }],
      schedules: [{ id: "s", cron: "0 8 * * 1" }],
    });
    const colMap: ColumnSchemaRef[] = [
      {
        tableId: "t-pos",
        columns: [
          { name: "ticker" }, { name: "qty" }, { name: "account" },
        ],
      },
    ];
    expect(pickKit(m, colMap)).toBe("coach");
  });

  it("customer-follow-up-drafter → inbox", () => {
    const m = makeManifest({
      id: "customer-follow-up-drafter",
      profiles: [{ id: "drafter" }],
      blueprints: [{ id: "follow-up-drafter" }],
      tables: [{ id: "t-touch" }],
    });
    const colMap: ColumnSchemaRef[] = [
      {
        tableId: "t-touch",
        columns: [
          { name: "channel" }, { name: "customer" },
          { name: "summary" }, { name: "sentiment" },
        ],
      },
    ];
    expect(pickKit(m, colMap)).toBe("inbox");
  });

  it("research-digest → research", () => {
    const m = makeManifest({
      id: "research-digest",
      profiles: [{ id: "researcher" }],
      blueprints: [{ id: "weekly-digest" }],
      tables: [{ id: "t-src" }],
      schedules: [{ id: "s", cron: "0 17 * * 5" }],
    });
    const colMap: ColumnSchemaRef[] = [
      {
        tableId: "t-src",
        columns: [{ name: "name" }, { name: "url" }, { name: "cadence" }],
      },
    ];
    expect(pickKit(m, colMap)).toBe("research");
  });

  it("finance-pack → ledger", () => {
    const m = makeManifest({
      id: "finance-pack",
      profiles: [{ id: "personal-cfo" }],
      blueprints: [{ id: "monthly-close" }],
      tables: [{ id: "t-txn" }],
    });
    const colMap: ColumnSchemaRef[] = [
      {
        tableId: "t-txn",
        columns: [
          { name: "date" }, { name: "amount" }, { name: "category" },
        ],
      },
    ];
    expect(pickKit(m, colMap)).toBe("ledger");
  });

  it("reading-log (personal-log shape) → tracker, NOT research", () => {
    // Regression: the actual user-composed reading-log app has a digest
    // blueprint + Friday schedule, which used to wrongly pull it into the
    // research kit. The hero columns are a books log with no source/url
    // shape, so it should land on tracker via the rating-as-completion-signal
    // path, leaving the books table visible to the user.
    const m = makeManifest({
      id: "reading-log",
      profiles: [{ id: "reading-log--digest" }],
      blueprints: [{ id: "reading-log--weekly-digest" }],
      tables: [{ id: "t-books" }],
      schedules: [{ id: "s", cron: "0 17 * * 5" }],
    });
    const colMap: ColumnSchemaRef[] = [
      {
        tableId: "t-books",
        columns: [
          { name: "title" },
          { name: "author" },
          { name: "date_finished", type: "date" },
          { name: "rating", type: "number" },
        ],
      },
    ];
    expect(pickKit(m, colMap)).toBe("tracker");
  });

  it("research-digest still wins research when hero has source shape", () => {
    // Sanity: the existing research-digest fixture has a `url` column on its
    // sources table. The tightened rule3_research must still fire there.
    const m = makeManifest({
      id: "research-digest",
      profiles: [{ id: "researcher" }],
      blueprints: [{ id: "weekly-digest" }],
      tables: [{ id: "t-src" }],
      schedules: [{ id: "s", cron: "0 17 * * 5" }],
    });
    const colMap: ColumnSchemaRef[] = [
      {
        tableId: "t-src",
        columns: [{ name: "name" }, { name: "url" }, { name: "cadence" }],
      },
    ];
    expect(pickKit(m, colMap)).toBe("research");
  });

  it("reading-radar → tracker", () => {
    const m = makeManifest({
      id: "reading-radar",
      profiles: [{ id: "reader-coach" }],
      blueprints: [{ id: "weekly-synthesis" }],
      tables: [{ id: "t-read" }],
      schedules: [{ id: "s", cron: "0 8 * * 0" }],
    });
    const colMap: ColumnSchemaRef[] = [
      {
        tableId: "t-read",
        columns: [
          { name: "title" }, { name: "url" }, { name: "date" },
          { name: "completed" }, { name: "notes" },
        ],
      },
    ];
    expect(pickKit(m, colMap)).toBe("tracker");
  });
});
