"use client";

/**
 * `useSavedSearches` — client-side store for saved filter combinations
 * surfaced in the chat mention popover and `⌘K` palette.
 *
 * Mirrors `use-pinned-entries.ts`: fetches once on mount, keeps an
 * in-memory list, and writes back via PUT on every mutation (full-list
 * replacement — see `src/app/api/settings/chat/saved-searches/route.ts`
 * for design rationale).
 */

import { useCallback, useEffect, useState } from "react";
import { randomId } from "@/lib/utils/uuid";

export type SavedSearchSurface =
  | "task"
  | "project"
  | "workflow"
  | "document"
  | "skill"
  | "profile";

export interface SavedSearch {
  id: string;
  surface: SavedSearchSurface;
  label: string;
  filterInput: string;
  createdAt: string;
}

interface UseSavedSearchesReturn {
  searches: SavedSearch[];
  loading: boolean;
  save: (entry: Omit<SavedSearch, "id" | "createdAt">) => SavedSearch;
  remove: (id: string) => void;
  forSurface: (surface: SavedSearchSurface) => SavedSearch[];
  /**
   * Re-fetch from the server. Each `useSavedSearches()` consumer holds
   * its own state — the chat popover and the ⌘K palette do not share a
   * cache. Components that need to see edits made elsewhere (e.g. the
   * palette opening after a save in the popover) call `refetch()` at
   * the right moment to revalidate.
   *
   * See features/saved-search-polish-v1.md for the bug history.
   */
  refetch: () => Promise<void>;
  rename: (id: string, label: string) => void;
}

export function useSavedSearches(): UseSavedSearchesReturn {
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [loading, setLoading] = useState(true);

  // Single fetch helper used by both the mount effect and `refetch`.
  // Returns void so consumers can `await` revalidation if they want
  // to wait for fresh data before continuing.
  const fetchSearches = useCallback(async (): Promise<void> => {
    try {
      const r = await fetch("/api/settings/chat/saved-searches");
      const data: { searches?: SavedSearch[] } = r.ok
        ? await r.json()
        : { searches: [] };
      setSearches(data.searches ?? []);
    } catch {
      setSearches([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSearches();
  }, [fetchSearches]);

  const persist = useCallback(async (next: SavedSearch[]) => {
    try {
      await fetch("/api/settings/chat/saved-searches", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ searches: next }),
      });
    } catch {
      // Optimistic update already applied; server-sync failure silently
      // swallowed. Matches the pins-hook contract.
    }
  }, []);

  const save = useCallback(
    (entry: Omit<SavedSearch, "id" | "createdAt">): SavedSearch => {
      const full: SavedSearch = {
        ...entry,
        id: randomId(),
        createdAt: new Date().toISOString(),
      };
      setSearches((prev) => {
        const next = [...prev, full];
        void persist(next);
        return next;
      });
      return full;
    },
    [persist]
  );

  const remove = useCallback(
    (id: string) => {
      setSearches((prev) => {
        const next = prev.filter((s) => s.id !== id);
        void persist(next);
        return next;
      });
    },
    [persist]
  );

  const forSurface = useCallback(
    (surface: SavedSearchSurface) =>
      searches.filter((s) => s.surface === surface),
    [searches]
  );

  const refetch = useCallback(() => fetchSearches(), [fetchSearches]);

  const rename = useCallback(
    (id: string, label: string) => {
      setSearches((prev) => {
        const idx = prev.findIndex((s) => s.id === id);
        if (idx === -1) return prev;
        const next = prev.slice();
        next[idx] = { ...next[idx], label };
        void persist(next);
        return next;
      });
    },
    [persist]
  );

  return { searches, loading, save, remove, forSurface, refetch, rename };
}
