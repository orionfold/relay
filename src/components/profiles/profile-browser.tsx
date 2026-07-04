"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Bot, Download, Copy, Package, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/shared/empty-state";
import { ProfileCard } from "@/components/profiles/profile-card";
import { ProfileImportDialog } from "@/components/profiles/profile-import-dialog";
import { RepoImportWizard } from "@/components/profiles/repo-import-wizard";
import type { AgentProfile } from "@/lib/agents/profiles/types";
import { packOf } from "@/lib/apps/pack-of";

interface ProfileWithBuiltin extends AgentProfile {
  isBuiltin?: boolean;
}

/** The installed-pack identity a profile carries (FEAT-8). {id, name} only. */
export interface InstalledPackRef {
  id: string;
  name: string;
}

interface ProfileBrowserProps {
  initialProfiles: AgentProfile[];
  /** Installed packs — resolves each profile's pack provenance (FEAT-8). */
  installedPacks?: InstalledPackRef[];
}

export function ProfileBrowser({
  initialProfiles,
  installedPacks = [],
}: ProfileBrowserProps) {
  const router = useRouter();
  const [profiles, setProfiles] = useState<ProfileWithBuiltin[]>(initialProfiles);

  // Stable {id → display name} lookup + the gated id-set for packOf. Rebuilt
  // only when the installed packs change (never on a profile refresh), so the
  // pill survives refreshProfiles — which recomputes from the refreshed id.
  const packNameById = useMemo(
    () => new Map(installedPacks.map((p) => [p.id, p.name])),
    [installedPacks]
  );
  const installedPackIds = useMemo(
    () => new Set(installedPacks.map((p) => p.id)),
    [installedPacks]
  );
  const packNameFor = useCallback(
    (profile: AgentProfile): string | null => {
      const packId = packOf(
        { kind: "profile", id: profile.id },
        installedPackIds
      );
      return packId ? packNameById.get(packId) ?? null : null;
    },
    [installedPackIds, packNameById]
  );
  const [search, setSearch] = useState("");
  const [domainFilter, setDomainFilter] = useState<
    "all" | "work" | "personal"
  >("all");
  const [showImport, setShowImport] = useState(false);
  const [showRepoImport, setShowRepoImport] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [provenanceFilter, setProvenanceFilter] = useState<
    "all" | "builtin" | "imported" | "custom"
  >("all");

  const refreshProfiles = useCallback(async () => {
    try {
      const res = await fetch("/api/agents");
      if (res.ok) {
        const data = await res.json();
        setProfiles(data);
      }
    } catch {
      // silent — fall back to current state
    }
    router.refresh();
  }, [router]);

  const builtinProfiles = profiles.filter((p) => p.isBuiltin);

  const filteredProfiles = useMemo(() => {
    const q = search.toLowerCase();
    return profiles.filter((p) => {
      if (domainFilter !== "all" && p.domain !== domainFilter) return false;
      if (provenanceFilter !== "all") {
        const isImported = !!p.importMeta;
        const isBi = p.isBuiltin;
        if (provenanceFilter === "builtin" && !isBi) return false;
        if (provenanceFilter === "imported" && !isImported) return false;
        if (provenanceFilter === "custom" && (isBi || isImported)) return false;
      }
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [profiles, search, domainFilter, provenanceFilter]);

  return (
    <div className="space-y-6">
      {/* Action buttons (title now provided by PageShell) */}
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" onClick={() => setShowTemplates(!showTemplates)}>
          <Copy className="mr-2 h-4 w-4" />
          Start from Template
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              <Download className="mr-2 h-4 w-4" />
              Import
              <ChevronDown className="ml-1 h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setShowImport(true)}>
              <Download className="mr-2 h-4 w-4" />
              Import from URL
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setShowRepoImport(true)}>
              <Package className="mr-2 h-4 w-4" />
              Import from Repository
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button onClick={() => router.push("/agents/new")}>
          <Plus className="mr-2 h-4 w-4" />
          Create Profile
        </Button>
      </div>

      {/* Template picker */}
      {showTemplates && builtinProfiles.length > 0 && (
        <div className="surface-panel rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Use a built-in profile as a starting point</p>
            <Button variant="ghost" size="sm" onClick={() => setShowTemplates(false)}>
              <span className="text-xs">Close</span>
            </Button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {builtinProfiles.map((p) => (
              <button
                key={p.id}
                type="button"
                className="bg-muted text-left rounded-lg border border-border/60 p-3 cursor-pointer hover:border-primary/40 hover:bg-accent transition-colors"
                onClick={() => {
                  setShowTemplates(false);
                  router.push(`/agents/${p.id}/edit?duplicate=true`);
                }}
              >
                <p className="text-sm font-medium truncate">{p.name}</p>
                <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                  {p.description}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Search + Domain Filter */}
      <div className="surface-panel flex flex-col gap-4 rounded-2xl p-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search profiles..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="surface-control pl-9"
          />
        </div>
        <Tabs
          value={domainFilter}
          onValueChange={(v) =>
            setDomainFilter(v as "all" | "work" | "personal")
          }
        >
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="work">Work</TabsTrigger>
            <TabsTrigger value="personal">Personal</TabsTrigger>
          </TabsList>
        </Tabs>
        <Tabs
          value={provenanceFilter}
          onValueChange={(v) =>
            setProvenanceFilter(v as "all" | "builtin" | "imported" | "custom")
          }
        >
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="builtin">Built-in</TabsTrigger>
            <TabsTrigger value="imported">Imported</TabsTrigger>
            <TabsTrigger value="custom">Custom</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Grid */}
      <ProfileImportDialog
        open={showImport}
        onOpenChange={setShowImport}
        onImported={refreshProfiles}
      />
      <RepoImportWizard
        open={showRepoImport}
        onOpenChange={setShowRepoImport}
        onImported={refreshProfiles}
      />

      {filteredProfiles.length === 0 ? (
        <EmptyState
          icon={Bot}
          heading="No profiles found"
          description="Try adjusting your search or filter, or create a new profile."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredProfiles.map((profile) => (
            <ProfileCard
              key={profile.id}
              profile={profile}
              isBuiltin={profile.isBuiltin}
              packName={packNameFor(profile)}
              onClick={() => router.push(`/agents/${profile.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
