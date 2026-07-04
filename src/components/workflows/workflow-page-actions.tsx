"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Layers, Plus } from "lucide-react";

export function WorkflowPageActions() {
  const router = useRouter();

  return (
    <>
      <Button variant="outline" onClick={() => router.push("/blueprints")}>
        <Layers className="h-4 w-4 mr-2" />
        From Blueprint
      </Button>
      <Button onClick={() => router.push("/workflows/new")}>
        <Plus className="h-4 w-4 mr-2" />
        New Workflow
      </Button>
    </>
  );
}
