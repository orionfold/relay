"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Building2,
  User,
  KanbanSquare,
  DollarSign,
  PenLine,
  Search,
  Table2,
} from "lucide-react";
import { TableTemplatePreview } from "./table-template-preview";
import { EmptyState } from "@/components/shared/empty-state";
import type { UserTableTemplateRow } from "@/lib/db/schema";
import type { TemplateCategory } from "@/lib/constants/table-status";
import type { LucideIcon } from "lucide-react";

const categoryIcons: Record<TemplateCategory, LucideIcon> = {
  business: Building2,
  personal: User,
  pm: KanbanSquare,
  finance: DollarSign,
  content: PenLine,
};

const categoryLabels: Record<TemplateCategory, string> = {
  business: "Business",
  personal: "Personal",
  pm: "Project Mgmt",
  finance: "Finance",
  content: "Content",
};

interface TableTemplateGalleryProps {
  templates: UserTableTemplateRow[];
}

export function TableTemplateGallery({ templates }: TableTemplateGalleryProps) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [previewTemplate, setPreviewTemplate] = useState<UserTableTemplateRow | null>(null);
  const router = useRouter();

  const filtered = templates.filter((t) => {
    if (category !== "all" && t.category !== category) return false;
    if (
      search &&
      !t.name.toLowerCase().includes(search.toLowerCase()) &&
      !(t.description ?? "").toLowerCase().includes(search.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  function handleCloned(tableId: string) {
    setPreviewTemplate(null);
    router.push(`/tables/${tableId}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search schemas..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <Tabs value={category} onValueChange={setCategory}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          {(Object.keys(categoryLabels) as TemplateCategory[]).map((cat) => (
            <TabsTrigger key={cat} value={cat}>
              {categoryLabels[cat]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Table2}
          heading="No schemas found"
          description={search ? "Try a different search term." : "No schemas in this category."}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((t) => {
            const catKey = t.category as TemplateCategory;
            const Icon = categoryIcons[catKey] ?? Table2;
            let columnCount = 0;
            try {
              columnCount = (JSON.parse(t.columnSchema) as unknown[]).length;
            } catch { /* */ }

            return (
              <Card
                key={t.id}
                tone="schema"
                watermark={Icon}
                className="hover:border-primary/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                tabIndex={0}
                onClick={() => setPreviewTemplate(t)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setPreviewTemplate(t);
                }}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-sm font-medium">
                      {t.name}
                    </CardTitle>
                    <Badge variant="outline" className="text-xs">
                      {categoryLabels[catKey] ?? t.category}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {t.description && (
                    <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
                      {t.description}
                    </p>
                  )}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{columnCount} columns</span>
                    <Badge variant="secondary" className="text-xs">
                      {t.scope}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {previewTemplate && (
        <TableTemplatePreview
          template={previewTemplate}
          open={!!previewTemplate}
          onOpenChange={(open) => {
            if (!open) setPreviewTemplate(null);
          }}
          onCloned={handleCloned}
        />
      )}
    </div>
  );
}
