"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { ChevronRight, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

interface ManifestSheetProps {
  appName: string;
  body: ReactNode;
}

/**
 * Client-side manifest sheet. Renders both the "View manifest ▾" trigger
 * button (placed inline in the page header) and the sliding sheet itself.
 *
 * Per project memory ([SheetContent body padding] in MEMORY.md), SheetContent
 * has no horizontal padding — the inner body wrapper must apply `px-6 pb-6`.
 */
export function ManifestSheet({ appName, body }: ManifestSheetProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label={`View manifest for ${appName}`}
      >
        <FileText className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
        View manifest
        <ChevronRight className="h-3.5 w-3.5 ml-1" aria-hidden="true" />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-hidden flex flex-col">
          <SheetHeader>
            <SheetTitle>Manifest — {appName}</SheetTitle>
            <SheetDescription>
              The full composition that defines this app. Profiles, blueprints,
              tables, schedules, and the underlying YAML.
            </SheetDescription>
          </SheetHeader>
          <div className="px-6 pb-6 space-y-4 overflow-y-auto flex-1">
            {body}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
