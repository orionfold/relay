"use client";

import { useEffect, useState, useCallback } from "react";
import { Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { FormSectionCard } from "@/components/shared/form-section-card";

interface WebSearchState {
  exaSearchEnabled: boolean;
}

const DEFAULT_STATE: WebSearchState = {
  exaSearchEnabled: false,
};

export function WebSearchSection() {
  const [state, setState] = useState<WebSearchState>(DEFAULT_STATE);
  const [saving, setSaving] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/web-search");
      if (res.ok) {
        const data = await res.json();
        setState(data);
      }
    } catch {
      // Use defaults
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleToggle = async (value: boolean) => {
    setState((prev) => ({ ...prev, exaSearchEnabled: value }));
    setSaving(true);
    try {
      const res = await fetch("/api/settings/web-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exaSearchEnabled: value }),
      });
      if (res.ok) {
        const data = await res.json();
        setState(data);
        toast.success(`Exa Search ${value ? "enabled" : "disabled"}`);
      }
    } catch {
      toast.error("Failed to save setting");
      setState((prev) => ({ ...prev, exaSearchEnabled: !value }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Search className="h-5 w-5" />
          Web Search
        </CardTitle>
        <CardDescription>
          Enhanced web search capabilities for agents. These are free services
          with no API keys required. They extend the built-in WebSearch and
          WebFetch tools with better search quality and cleaner page reading.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <FormSectionCard
          icon={Sparkles}
          title="Exa Semantic Search"
          hint="Neural search engine that finds conceptually related content, not just keyword matches. Available to researcher, general, and data-analyst profiles. All tools are read-only and auto-approved."
        >
          <div className="flex items-center justify-between">
            <Label htmlFor="exa-search-toggle" className="text-sm">
              {state.exaSearchEnabled ? "Enabled" : "Disabled"}
            </Label>
            <Switch
              id="exa-search-toggle"
              checked={state.exaSearchEnabled}
              disabled={saving}
              onCheckedChange={handleToggle}
            />
          </div>
        </FormSectionCard>
      </CardContent>
    </Card>
  );
}
