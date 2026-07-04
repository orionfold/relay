"use client";

import { useState, useEffect } from "react";
import type { AgentProfile } from "@/lib/agents/profiles/types";

/**
 * Fetches all tags from existing profiles for autocomplete suggestions.
 * Deduplicates and sorts alphabetically. Cached in component state.
 */
export function useTagSuggestions() {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/agents")
      .then((r) => (r.ok ? r.json() : []))
      .then((profiles: AgentProfile[]) => {
        const allTags = new Set<string>();
        for (const p of profiles) {
          for (const t of p.tags) {
            allTags.add(t.toLowerCase());
          }
        }
        setSuggestions([...allTags].sort());
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return { suggestions, loading };
}
