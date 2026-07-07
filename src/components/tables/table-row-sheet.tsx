"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { toast } from "sonner";
import { TableRelationCombobox } from "./table-relation-combobox";
import type { ColumnDef } from "@/lib/tables/types";

interface ParsedRow {
  id: string;
  data: Record<string, unknown>;
  position: number;
  createdBy: string | null;
}

interface TableRowSheetProps {
  tableId: string;
  columns: ColumnDef[];
  row: ParsedRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRowUpdated: (rowId: string, data: Record<string, unknown>) => void;
}

export function TableRowSheet({
  tableId,
  columns,
  row,
  open,
  onOpenChange,
  onRowUpdated,
}: TableRowSheetProps) {
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);

  // Reset form data when sheet opens or row changes
  useEffect(() => {
    if (open) {
      setFormData({ ...row.data });
    }
  }, [open, row.id, row.data]);

  const setField = (name: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Exclude computed columns from the payload
      const payload: Record<string, unknown> = {};
      for (const col of columns) {
        if (col.dataType !== "computed") {
          payload[col.name] = formData[col.name] ?? null;
        }
      }

      const res = await fetch(`/api/tables/${tableId}/rows/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: payload }),
      });

      if (!res.ok) {
        toast.error("Failed to save row");
        return;
      }

      onRowUpdated(row.id, { ...formData, ...payload });
      onOpenChange(false);
      toast.success("Row updated");
    } catch {
      toast.error("Failed to save row");
    } finally {
      setSaving(false);
    }
  };

  const sortedColumns = [...columns].sort((a, b) => a.position - b.position);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[480px] sm:max-w-[480px] flex flex-col">
        <SheetHeader>
          <SheetTitle>Edit Row</SheetTitle>
          <SheetDescription>
            Update the selected table row fields.
          </SheetDescription>
        </SheetHeader>
        <div className="px-6 pb-6 space-y-4 overflow-y-auto flex-1">
          {sortedColumns.map((col) => (
            <RowField
              key={col.name}
              column={col}
              value={formData[col.name]}
              onChange={(v) => setField(col.name, v)}
            />
          ))}
        </div>
        <SheetFooter className="px-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ── Per-field renderer ──────────────────────────────────────────────────

interface RowFieldProps {
  column: ColumnDef;
  value: unknown;
  onChange: (value: unknown) => void;
}

function RowField({ column, value, onChange }: RowFieldProps) {
  const strValue = value == null ? "" : String(value);

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-1.5">
        {column.displayName}
        {column.required && <span className="text-destructive">*</span>}
      </Label>
      {renderInput(column, value, strValue, onChange)}
    </div>
  );
}

function renderInput(
  column: ColumnDef,
  value: unknown,
  strValue: string,
  onChange: (value: unknown) => void,
) {
  switch (column.dataType) {
    case "text":
      return (
        <Textarea
          rows={3}
          value={strValue}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`Enter ${column.displayName.toLowerCase()}...`}
        />
      );

    case "number":
      return (
        <Input
          type="number"
          value={strValue}
          onChange={(e) =>
            onChange(e.target.value === "" ? null : Number(e.target.value))
          }
          placeholder="0"
        />
      );

    case "date":
      return (
        <Input
          type="date"
          value={strValue}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case "email":
      return (
        <Input
          type="email"
          value={strValue}
          onChange={(e) => onChange(e.target.value)}
          placeholder="name@example.com"
        />
      );

    case "url":
      return (
        <Input
          type="url"
          value={strValue}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://..."
        />
      );

    case "boolean":
      return (
        <div className="flex items-center gap-2 pt-1">
          <Switch
            checked={!!value}
            onCheckedChange={(checked) => onChange(checked)}
          />
          <span className="text-sm text-muted-foreground">
            {value ? "Yes" : "No"}
          </span>
        </div>
      );

    case "select": {
      const options = column.config?.options ?? [];
      return (
        <Select value={strValue} onValueChange={onChange}>
          <SelectTrigger>
            <SelectValue placeholder={`Select ${column.displayName.toLowerCase()}...`} />
          </SelectTrigger>
          <SelectContent>
            {options.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    case "relation": {
      const targetId = column.config?.targetTableId;
      const dispCol = column.config?.displayColumn ?? "name";
      if (!targetId) return <Input disabled value="No target table configured" />;
      return (
        <TableRelationCombobox
          targetTableId={targetId}
          displayColumn={dispCol}
          value={strValue || null}
          onChange={(v) => onChange(v)}
        />
      );
    }

    case "computed":
      return (
        <Input
          disabled
          value={strValue}
          className="text-muted-foreground italic"
        />
      );

    default:
      return (
        <Input
          value={strValue}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`Enter ${column.displayName.toLowerCase()}...`}
        />
      );
  }
}
