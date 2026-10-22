"use client";

import { useEffect, useState } from "react";

import { THEME_STORAGE_KEY, THEMES, isTheme, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const LABELS: Record<Theme, string> = { system: "System", light: "Light", dark: "Dark" };

function apply(theme: Theme) {
  const dark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

/**
 * System / Light / Dark. Stored in localStorage, where the inline script in
 * app/layout.tsx reads it before first paint (lib/theme.ts).
 */
export function ThemePicker() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(THEME_STORAGE_KEY);
    } catch {
      // Private windows can refuse storage; stay on System.
    }
    if (isTheme(saved)) queueMicrotask(() => setTheme(saved));
  }, []);

  function pick(next: Theme) {
    setTheme(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Applies for this visit even if it can't be remembered.
    }
    apply(next);
  }

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="grid grid-cols-3 gap-1 rounded-md bg-muted p-1"
    >
      {THEMES.map((t) => (
        <button
          key={t}
          type="button"
          role="radio"
          aria-checked={theme === t}
          onClick={() => pick(t)}
          className={cn(
            "h-10 rounded-sm text-sm font-bold",
            theme === t ? "bg-card shadow-sm" : "text-muted-foreground",
          )}
        >
          {LABELS[t]}
        </button>
      ))}
    </div>
  );
}
