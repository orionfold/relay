"use client";

import { Key, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AuthMethod } from "@/lib/constants/settings";

interface AuthMethodOption {
  id: AuthMethod;
  icon: typeof Key;
  title: string;
  description: string;
}

interface AuthMethodSelectorProps {
  value: AuthMethod;
  onChange: (method: AuthMethod) => void;
  recommendedMethod?: AuthMethod | null;
  label?: string;
  options?: AuthMethodOption[];
}

const defaultMethods = [
  {
    id: "api_key" as const,
    icon: Key,
    title: "API Key",
    description: "Use an Anthropic API key for authentication",
  },
  {
    id: "oauth" as const,
    icon: Shield,
    title: "OAuth",
    description: "Claude Max or Pro subscription",
  },
];

export function AuthMethodSelector({
  value,
  onChange,
  recommendedMethod,
  label = "Authentication Method",
  options = defaultMethods,
}: AuthMethodSelectorProps) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <div className="grid grid-cols-2 gap-3">
        {options.map((method) => {
          const Icon = method.icon;
          const isSelected = value === method.id;
          return (
            <button
              key={method.id}
              type="button"
              onClick={() => onChange(method.id)}
              className={cn(
                "flex flex-col items-center gap-2 rounded-lg border-2 p-4 text-center transition-all",
                "hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isSelected
                  ? "border-primary bg-primary/5"
                  : "border-border/40 bg-card/30"
              )}
            >
              <Icon className={cn(
                "h-5 w-5",
                isSelected ? "text-primary" : "text-muted-foreground"
              )} />
              <span className={cn(
                "text-sm font-medium",
                isSelected ? "text-foreground" : "text-muted-foreground"
              )}>
                {method.title}
              </span>
              <span className="text-xs text-muted-foreground">
                {method.description}
              </span>
              {recommendedMethod === method.id && !isSelected && (
                <span className="text-[10px] font-medium uppercase tracking-wider text-primary/70 mt-0.5">
                  Recommended
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
