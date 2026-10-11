import { Activity, Cpu, History, Info, Monitor, Moon, ScanSearch, Sun } from "lucide-react";
import { useEffect } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useHistory } from "../hooks/useHistory";
import { useHealth } from "../hooks/useModel";
import { useTheme, type ThemeMode } from "../hooks/useTheme";
import { ErrorBoundary } from "./ErrorBoundary";
import { cx } from "./ui";

const NAV = [
  { to: "/", label: "Classify", icon: ScanSearch, end: true },
  { to: "/history", label: "History", icon: History, end: false },
  { to: "/model", label: "Model", icon: Cpu, end: false },
  { to: "/about", label: "How it works", short: "About", icon: Info, end: false },
] as const;

const TITLES: Record<string, string> = {
  "/": "Classify",
  "/history": "History",
  "/model": "Model",
  "/about": "How it works",
};

/** Black circle + white pill, like the reference's "Video call" control. */
function StatusPill() {
  const { data, isPending, isError } = useHealth();
  const state = isPending ? "checking" : isError ? "down" : "up";
  const label = data ? `${data.model_name.toUpperCase()} v${data.model_version}` : "Model API";
  const status = { checking: "Checking…", down: "Offline", up: "Online" }[state];
  return (
    <Link
      to="/model"
      title="Model API status. Click for details"
      className="flex h-12 items-center gap-3 rounded-full bg-surface/90 py-1 pl-1 pr-4 shadow-card backdrop-blur-xl transition hover:bg-surface"
    >
      <span className="grid size-10 place-items-center rounded-full bg-primary text-on-primary">
        <Activity className="size-4" aria-hidden />
      </span>
      <span className="hidden leading-tight sm:block">
        <span className="block text-xs font-medium">{label}</span>
        <span className="flex items-center gap-1.5 text-[11px] text-muted">
          <span
            className={cx(
              "size-1.5 rounded-full",
              state === "up" && "bg-emerald-500",
              state === "down" && "bg-rose-500",
              state === "checking" && "animate-pulse bg-muted",
            )}
          />
          {status}
        </span>
      </span>
      <span className="sr-only sm:hidden">
        {label} {status}
      </span>
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
      className="flex h-12 items-center gap-0.5 rounded-full bg-surface/90 p-1 shadow-card backdrop-blur-xl"
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
            "grid size-10 place-items-center rounded-full transition",
            mode === m ? "bg-primary text-on-primary" : "text-muted hover:text-ink",
          )}
        >
          <Icon className="size-4" aria-hidden />
          <span className="sr-only">{label}</span>
        </button>
      ))}
    </div>
  );
}

function NavPills({ className }: { className?: string }) {
  const { entries } = useHistory();
  return (
    <nav
      aria-label="Main"
      className={cx(
        "flex h-12 items-center gap-0.5 rounded-full bg-surface/90 p-1 shadow-card backdrop-blur-xl",
        className,
      )}
    >
      {NAV.map(({ to, label, icon: Icon, end, ...rest }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            cx(
              "inline-flex h-10 flex-1 shrink-0 items-center justify-center gap-2 rounded-full px-3 text-sm transition sm:px-4 lg:flex-none",
              isActive ? "bg-primary text-on-primary" : "text-muted hover:text-ink",
            )
          }
        >
          {({ isActive }) => (
            <>
              <Icon className="hidden size-4 min-[400px]:block" aria-hidden />
              {"short" in rest ? (
                <>
                  <span className="sm:hidden">{rest.short}</span>
                  <span className="hidden sm:inline">{label}</span>
                </>
              ) : (
                label
              )}
              {to === "/history" && entries.length > 0 && (
                <span
                  className={cx(
                    "grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[10px] font-semibold",
                    isActive ? "bg-on-primary text-primary" : "bg-primary text-on-primary",
                  )}
                >
                  {entries.length}
                </span>
              )}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

export function Layout() {
  const { pathname } = useLocation();

  useEffect(() => {
    document.title = `${TITLES[pathname] ?? "Not found"} · Classifier Studio`;
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-surface focus:px-4 focus:py-2 focus:shadow-card"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-30 bg-canvas/70 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Link to="/" className="mr-2 flex items-center gap-3">
              <span className="grid size-12 place-items-center rounded-full bg-primary text-on-primary">
                <svg viewBox="0 0 32 32" className="size-5" aria-hidden>
                  <path d="M6 6h8v8H6zm0 12h8v8H6zM18 6h8v8h-8zm0 12h5v8h-5z" fill="currentColor" />
                </svg>
              </span>
              <span className="hidden leading-tight min-[420px]:block">
                <span className="block text-[15px] font-semibold tracking-tight">Classifier</span>
                <span className="block text-[11px] uppercase tracking-[0.12em] text-muted">Studio</span>
              </span>
            </Link>

            <NavPills className="hidden lg:flex" />

            <div className="ml-auto flex items-center gap-2">
              <StatusPill />
              <ThemeSwitcher />
            </div>
          </div>

          {/* Below lg the same top-bar nav wraps onto its own scrollable row. */}
          <NavPills className="scrollbar-none mt-3 overflow-x-auto lg:hidden" />
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 pb-16 pt-6 sm:px-6 lg:pt-10">
        <ErrorBoundary resetKey={pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>

      <footer className="mx-auto w-full max-w-7xl px-4 pb-8 text-[11px] uppercase tracking-[0.12em] text-muted sm:px-6">
        PyTorch · FastAPI on Oracle Cloud · UI on Vercel
      </footer>
    </div>
  );
}
