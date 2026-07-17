import { describe, it, expect, vi, beforeEach } from "vitest";

// Map-backed mock DB — same pattern used by settings-tools.test.ts but one
// level lower so the helpers under test (getModelPreference / setModelPreference)
// run for real and exercise their coercion logic against the boundary.
const { store, transactionState } = vi.hoisted(() => ({
  store: new Map<string, string>(),
  transactionState: { failure: null as Error | null },
}));

vi.mock("@/lib/db", () => {
  const select = () => ({
    from: () => ({
      where: (predicate: { key?: string; keys?: string[] }) => ({
        all: () => {
          const keys = predicate.keys ?? (predicate.key ? [predicate.key] : []);
          return keys
            .filter((key) => store.has(key))
            .map((key) => ({ key, value: store.get(key) }));
        },
        then: (
          resolve: (rows: Array<{ key: string; value: string | undefined }>) => unknown
        ) => {
          const keys = predicate.keys ?? (predicate.key ? [predicate.key] : []);
          return Promise.resolve(
            keys
              .filter((key) => store.has(key))
              .map((key) => ({ key, value: store.get(key) }))
          ).then(resolve);
        },
      }),
    }),
  });
  const insert = () => ({
    values: (row: { key: string; value: string }) => {
      const existed = store.has(row.key);
      store.set(row.key, row.value);
      return {
        run: () => ({ changes: existed ? 0 : 1 }),
        onConflictDoNothing: () => ({
          run: () => ({ changes: existed ? 0 : 1 }),
        }),
      };
    },
  });
  const update = () => ({
    set: (patch: { value: string }) => ({
      where: (predicate: { key: string }) => {
        store.set(predicate.key, patch.value);
        return { run: () => undefined };
      },
    }),
  });
  const mockedDb = {
    select,
    insert,
    update,
    transaction: (callback: (tx: unknown) => unknown) => {
      if (transactionState.failure) throw transactionState.failure;
      return callback(mockedDb);
    },
  };
  return { db: mockedDb };
});

vi.mock("@/lib/db/schema", () => ({
  settings: { key: "key" },
}));

// drizzle-orm `eq(col, value)` is called with our mocked column object;
// we just need a deterministic shape for the predicate that the mocked
// `.where(...)` can read.
vi.mock("drizzle-orm", () => ({
  eq: (_col: unknown, value: string) => ({ key: value }),
  inArray: (_col: unknown, values: string[]) => ({ keys: values }),
}));

import {
  claimModelPreferencePromptImpression,
  getModelPreference,
  setModelPreference,
  hasSeenModelPreferencePrompt,
  ModelPreferencePromptImpressionWriteError,
} from "../helpers";

beforeEach(() => {
  store.clear();
  transactionState.failure = null;
});

describe("getModelPreference", () => {
  it("returns null when no preference recorded", async () => {
    expect(await getModelPreference()).toBeNull();
  });

  it("returns the persisted preference for known values", async () => {
    for (const pref of ["quality", "cost", "privacy", "balanced"] as const) {
      await setModelPreference(pref);
      expect(await getModelPreference()).toBe(pref);
    }
  });

  it("coerces unknown raw values back to null", async () => {
    store.set("chat.modelPreference", "definitely-not-a-real-preference");
    expect(await getModelPreference()).toBeNull();
  });

  it("treats the empty string (skip marker) as null", async () => {
    store.set("chat.modelPreference", "");
    expect(await getModelPreference()).toBeNull();
  });
});

describe("setModelPreference", () => {
  it("persists each known preference", async () => {
    await setModelPreference("quality");
    expect(store.get("chat.modelPreference")).toBe("quality");
  });

  it("writes empty string when set to null (skip marker)", async () => {
    await setModelPreference(null);
    expect(store.get("chat.modelPreference")).toBe("");
  });

  it("overwrites previous preference", async () => {
    await setModelPreference("cost");
    await setModelPreference("privacy");
    expect(store.get("chat.modelPreference")).toBe("privacy");
  });
});

describe("hasSeenModelPreferencePrompt", () => {
  it("is false when nothing has been recorded", async () => {
    expect(await hasSeenModelPreferencePrompt()).toBe(false);
  });

  it("is true after a real preference is set", async () => {
    await setModelPreference("balanced");
    expect(await hasSeenModelPreferencePrompt()).toBe(true);
  });

  it("is true after Skip (null preference recorded as empty string)", async () => {
    await setModelPreference(null);
    expect(await hasSeenModelPreferencePrompt()).toBe(true);
  });
});

describe("claimModelPreferencePromptImpression", () => {
  it("lets only one concurrent browser claim a genuinely fresh instance", async () => {
    const claims = await Promise.all([
      claimModelPreferencePromptImpression(),
      claimModelPreferencePromptImpression(),
    ]);
    expect(claims.sort()).toEqual([false, true]);
    expect(store.get("onboarding.modelPreferencePromptImpression")).toMatch(
      /^\d{4}-\d{2}-\d{2}T/
    );
  });

  it("grandfathers an instance with a saved default model", async () => {
    store.set("chat.defaultModel", "sonnet");
    expect(await claimModelPreferencePromptImpression()).toBe(false);
    expect(store.has("onboarding.modelPreferencePromptImpression")).toBe(false);
  });

  it("grandfathers Confirm and legacy Skip preference rows", async () => {
    store.set("chat.modelPreference", "");
    expect(await claimModelPreferencePromptImpression()).toBe(false);

    store.set("chat.modelPreference", "balanced");
    expect(await claimModelPreferencePromptImpression()).toBe(false);
  });

  it("wraps persistence failures in a named error", async () => {
    transactionState.failure = new Error("database is read-only");
    await expect(claimModelPreferencePromptImpression()).rejects.toMatchObject({
      name: "ModelPreferencePromptImpressionWriteError",
      code: "MODEL_PREFERENCE_PROMPT_IMPRESSION_WRITE_FAILED",
    } satisfies Partial<ModelPreferencePromptImpressionWriteError>);
  });
});
