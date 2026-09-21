"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

// The console follows the operating system unless the operator picks a side. The choice
// lives in this browser only; the root layout applies it before the first paint so the
// page never flashes the wrong theme.
export const THEME_KEY = "kennedy-theme";
type Theme = "system" | "light" | "dark";

const CHOICES: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: "system", label: "Match the system", Icon: Monitor },
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
];

export function ThemeSwitch() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(THEME_KEY);
      if (stored === "light" || stored === "dark") setTheme(stored);
    } catch {
      // Private mode or blocked storage: the system theme stands.
    }
  }, []);

  const choose = (next: Theme) => {
    setTheme(next);
    try {
      if (next === "system") localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, next);
    } catch {
      // Nothing to do; the choice still applies to this page.
    }
    if (next === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = next;
  };

  return (
    <div className="theme-switch" role="group" aria-label="Appearance">
      {CHOICES.map(({ value, label, Icon }) => (
        <button key={value} type="button" title={label} aria-label={label} aria-pressed={theme === value} onClick={() => choose(value)}>
          <Icon size={14} strokeWidth={1.75} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
