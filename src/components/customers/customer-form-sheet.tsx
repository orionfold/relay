"use client";

import { useState, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export interface CustomerFormValues {
  id: string;
  name: string;
  slug: string;
  industry: string | null;
  notes: string | null;
  status: string;
}

interface CustomerFormSheetProps {
  mode: "create" | "edit";
  customer?: CustomerFormValues | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function CustomerFormSheet({
  mode,
  customer,
  open,
  onOpenChange,
  onSaved,
}: CustomerFormSheetProps) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [industry, setIndustry] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("active");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName(customer?.name ?? "");
      setSlug(customer?.slug ?? "");
      setIndustry(customer?.industry ?? "");
      setNotes(customer?.notes ?? "");
      setStatus(customer?.status ?? "active");
    }
  }, [open, customer]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSubmitting(true);
    try {
      const isEdit = mode === "edit" && customer;
      const url = isEdit ? `/api/customers/${customer.id}` : "/api/customers";
      const method = isEdit ? "PATCH" : "POST";
      const body = isEdit
        ? {
            name: name.trim(),
            industry: industry.trim() || null,
            notes: notes.trim() || null,
            status,
          }
        : {
            name: name.trim(),
            slug: slug.trim() || undefined,
            industry: industry.trim() || undefined,
            notes: notes.trim() || undefined,
            status,
          };
      const res = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(
          typeof data?.error === "string" ? data.error : "Failed to save customer"
        );
      }
      toast.success(isEdit ? "Customer updated" : "Customer created");
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save customer");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{mode === "edit" ? "Edit customer" : "New customer"}</SheetTitle>
          <SheetDescription>
            {mode === "edit"
              ? "Update this account's details."
              : "Add an account you run ops for. The slug is the stable handle used to link work and seed data."}
          </SheetDescription>
        </SheetHeader>
        {/* Body — px-6 pb-6 per project convention (SheetContent has NO body padding) */}
        <div className="px-6 pb-6 overflow-y-auto">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="customer-name">Name</Label>
              <Input
                id="customer-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Meridian Commercial Realty"
                autoFocus
              />
            </div>

            {mode === "create" && (
              <div className="space-y-2">
                <Label htmlFor="customer-slug">Slug (optional)</Label>
                <Input
                  id="customer-slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="meridian-cre (derived from name if blank)"
                />
                <p className="text-xs text-muted-foreground">
                  Lowercase letters, numbers, and hyphens. Immutable once set.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="customer-industry">Industry</Label>
              <Input
                id="customer-industry"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                placeholder="CRE, nonprofit, …"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="customer-status">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger id="customer-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="customer-notes">Notes</Label>
              <Textarea
                id="customer-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anything worth remembering about this account."
                rows={4}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving…" : mode === "edit" ? "Save changes" : "Create customer"}
              </Button>
            </div>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}
