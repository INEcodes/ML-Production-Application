import { useEffect, useState } from "react";

export type ThemeMode = "light" | "dark" | "system";

const media = () => window.matchMedia("(prefers-color-scheme: dark)");

function readMode(): ThemeMode {
  try {
    const t = localStorage.getItem("theme");
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(readMode);

  useEffect(() => {
    const apply = () => {
      const dark = mode === "dark" || (mode === "system" && media().matches);
      document.documentElement.classList.toggle("dark", dark);
    };
    apply();
    try {
      if (mode === "system") localStorage.removeItem("theme");
      else localStorage.setItem("theme", mode);
    } catch {
      // storage unavailable: theme still applies for this visit
    }
    if (mode !== "system") return;
    const mq = media();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [mode]);

  return { mode, setMode };
}
