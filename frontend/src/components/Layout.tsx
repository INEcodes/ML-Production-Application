import { Boxes, Cpu, History, Info, Monitor, Moon, Sparkles, Sun } from "lucide-react";
import { useEffect } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useHistory } from "../hooks/useHistory";
import { useHealth } from "../hooks/useModel";
import { useTheme, type ThemeMode } from "../hooks/useTheme";
import { cx } from "./ui";

const NAV = [
  { to: "/", label: "Classify", icon: Sparkles, end: true },
  { to: "/history", label: "History", icon: History },
  { to: "/model", label: "Model", icon: Cpu },
  { to: "/about", label: "How it works", shortLabel: "About", icon: Info },
] as const;

const TITLES: Record<string, string> = {
  "/": "Classify",
  "/history": "History",
  "/model": "Model",
  "/about": "How it works",
};

function StatusPill() {
  const { data, isPending, isError } = useHealth();
  const state = isPending ? "checking" : isError ? "down" : "up";
  const text = {
    checking: "Checking API…",
    down: "API offline",
    up: `${data?.model_name.toUpperCase()} v${data?.model_version} online`,
  }[state];
  return (
    <Link
      to="/model"
      title="Model API status (click for details)"
      className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
    >
      <span className="relative flex size-2">
        {state === "up" && (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
        )}
        <span
          className={cx(
            "relative inline-flex size-2 rounded-full",
            state === "up" && "bg-emerald-500",
            state === "down" && "bg-rose-500",
            state === "checking" && "bg-slate-400",
          )}
        />
      </span>
      <span className="hidden sm:inline">{text}</span>
      <span className="sr-only sm:hidden">{text}</span>
    </Link>
  );
}

const THEMES: { mode: ThemeMode; icon: typeof Sun; label: string }[] = [
  { mode: "light", icon: Sun, label: "Light" },
  { mode: "system", icon: Monitor, label: "System" },
  { mode: "dark", icon: Moon, label: "Dark" },
];

function ThemeSwitcher() {
  const { mode, setMode } = useTheme();
  return (
    <div
      role="radiogroup"
      aria-label="Color theme"
      className="flex rounded-full border border-slate-200 p-0.5 dark:border-slate-800"
    >
      {THEMES.map(({ mode: m, icon: Icon, label }) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={mode === m}
          title={`${label} theme`}
          onClick={() => setMode(m)}
          className={cx(
            "grid size-7 place-items-center rounded-full transition-colors",
            mode === m
              ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
              : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white",
          )}
        >
          <Icon className="size-3.5" aria-hidden />
          <span className="sr-only">{label}</span>
        </button>
      ))}
    </div>
  );
}

export function Layout() {
  const { entries } = useHistory();
  const { pathname } = useLocation();

  useEffect(() => {
    document.title = `${TITLES[pathname] ?? "Not found"} · Classifier Studio`;
    window.scrollTo(0, 0);
  }, [pathname]);

  const count = (to: string) =>
    to === "/history" && entries.length > 0 ? (
      <span className="ml-1 rounded-full bg-indigo-100 px-1.5 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-900 dark:text-indigo-200">
        {entries.length}
      </span>
    ) : null;

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:shadow"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <span className="grid size-8 place-items-center rounded-lg bg-indigo-600 text-white">
              <Boxes className="size-4.5" aria-hidden />
            </span>
            <span>Classifier Studio</span>
          </Link>

          <nav aria-label="Main" className="ml-6 hidden items-center gap-1 md:flex">
            {NAV.map(({ to, label, icon: Icon, ...rest }) => (
              <NavLink
                key={to}
                to={to}
                end={"end" in rest}
                className={({ isActive }) =>
                  cx(
                    "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white",
                  )
                }
              >
                <Icon className="size-4" aria-hidden />
                {label}
                {count(to)}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <StatusPill />
            <ThemeSwitcher />
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-6 sm:px-6 md:pb-12 md:pt-10">
        <Outlet />
      </main>

      <footer className="hidden border-t border-slate-200 py-6 text-center text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400 md:block">
        PyTorch model served by FastAPI on Oracle Cloud · UI on Vercel
      </footer>

      {/* Mobile: thumb-reachable bottom tab bar */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 md:hidden"
      >
        <div className="grid grid-cols-4">
          {NAV.map(({ to, label, icon: Icon, ...rest }) => (
            <NavLink
              key={to}
              to={to}
              end={"end" in rest}
              className={({ isActive }) =>
                cx(
                  "flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium",
                  isActive
                    ? "text-indigo-600 dark:text-indigo-400"
                    : "text-slate-500 dark:text-slate-400",
                )
              }
            >
              <span className="relative">
                <Icon className="size-5" aria-hidden />
                {to === "/history" && entries.length > 0 && (
                  <span className="absolute -right-2 -top-1 size-2 rounded-full bg-indigo-500" />
                )}
              </span>
              {"shortLabel" in rest ? rest.shortLabel : label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
