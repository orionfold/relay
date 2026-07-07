"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

interface AppDetailEntryFocusProps {
  targetId: string;
}

export function AppDetailEntryFocus({ targetId }: AppDetailEntryFocusProps) {
  const pathname = usePathname();

  useEffect(() => {
    if (window.location.hash) return;

    const timer = window.setTimeout(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      document.getElementById(targetId)?.focus({ preventScroll: true });
    }, 0);

    return () => window.clearTimeout(timer);
  }, [pathname, targetId]);

  return null;
}
