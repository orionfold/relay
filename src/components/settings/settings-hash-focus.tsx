"use client";

import { useEffect } from "react";

function focusHashTarget() {
  const id = window.location.hash.slice(1);
  if (!id) return;
  const target = document.getElementById(decodeURIComponent(id));
  if (!target) return;
  target.scrollIntoView({ block: "start" });
  target.focus({ preventScroll: true });
}

export function SettingsHashFocus() {
  useEffect(() => {
    function scheduleFocus() {
      const timers = [0, 150, 500, 1000].map((delay) =>
        window.setTimeout(focusHashTarget, delay),
      );
      return () => timers.forEach((timer) => window.clearTimeout(timer));
    }

    let cancelPending = scheduleFocus();
    function handleHashChange() {
      cancelPending();
      cancelPending = scheduleFocus();
    }

    window.addEventListener("hashchange", handleHashChange);
    return () => {
      cancelPending();
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, []);

  return null;
}
