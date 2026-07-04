"use client";

import { useState, useEffect, useRef } from "react";

export interface ProjectSkillEntry {
  id: string;
  name: string;
  description: string;
}

/**
 * Fetches project-scoped skill profiles for the active project.
 * Returns an empty array when no projectId is provided.
 */
export function useProjectSkills(projectId?: string | null): {
  skills: ProjectSkillEntry[];
  loading: boolean;
} {
  const [skills, setSkills] = useState<ProjectSkillEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!projectId) {
      setSkills([]);
      return;
    }

    // Abort any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    fetch(
      `/api/agents?scope=project&projectId=${encodeURIComponent(projectId)}`,
      { signal: controller.signal }
    )
      .then((res) => res.json())
      .then((data: Array<{ id: string; name: string; description: string }>) => {
        if (!controller.signal.aborted) {
          setSkills(
            data.map((p) => ({
              id: p.id,
              name: p.name,
              description: p.description,
            }))
          );
        }
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setSkills([]);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [projectId]);

  return { skills, loading };
}
