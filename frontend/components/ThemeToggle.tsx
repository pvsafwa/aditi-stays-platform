"use client";

import { usePathname } from "next/navigation";
import { Moon, Sun } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";

function scopeStorageKey(pathname: string): string {
  return pathname.startsWith("/admin") ? "aditi_theme_admin" : "aditi_theme_user";
}

type Props = {
  className?: string;
};

export default function ThemeToggle({ className = "" }: Props) {
  const pathname = usePathname() || "/";
  const storageKey = useMemo(() => scopeStorageKey(pathname), [pathname]);
  const [isDark, setIsDark] = useState(false);

  const applyTheme = useCallback((dark: boolean) => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.classList.toggle("dark", dark);
    root.style.colorScheme = dark ? "dark" : "light";
    setIsDark(dark);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(storageKey);
    const dark = saved === "dark";
    applyTheme(dark);
  }, [storageKey, applyTheme]);

  const onToggle = () => {
    const nextDark = !isDark;
    applyTheme(nextDark);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, nextDark ? "dark" : "light");
    }
  };

  return (
    <Button
      type="button"
      variant="secondary"
      size="icon"
      onClick={onToggle}
      className={`relative rounded-full border-border/70 bg-background/85 backdrop-blur ${className}`}
      aria-label="Toggle light and dark mode"
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      <Sun className={`h-[1.1rem] w-[1.1rem] transition-all ${isDark ? "scale-0 rotate-90 opacity-0" : "scale-100 rotate-0 opacity-100"}`} />
      <Moon className={`absolute h-[1.1rem] w-[1.1rem] transition-all ${isDark ? "scale-100 rotate-0 opacity-100" : "scale-0 -rotate-90 opacity-0"}`} />
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
