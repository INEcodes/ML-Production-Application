import { AlertTriangle, Loader2, RotateCw } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type Variant = "primary" | "secondary" | "ghost" | "danger" | "inverse";

const variants: Record<Variant, string> = {
  primary: "bg-primary text-on-primary hover:opacity-85",
  secondary: "bg-surface text-ink ring-1 ring-line-strong hover:bg-subtle",
  ghost: "text-muted hover:bg-subtle hover:text-ink",
  danger: "text-rose-600 ring-1 ring-rose-300 hover:bg-rose-50 dark:text-rose-400 dark:ring-rose-900 dark:hover:bg-rose-950",
  // for use on black (contrast) cards
  inverse: "bg-on-contrast text-contrast hover:opacity-85",
};

export function Button({
  variant = "primary",
  loading = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || loading}
      className={cx(
        "inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        className,
      )}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

/** The reference's signature element: a solid black circle holding an icon. */
export function IconCircle({
  children,
  size = "md",
  inverse,
  className,
}: {
  children: ReactNode;
  size?: "sm" | "md" | "lg";
  inverse?: boolean;
  className?: string;
}) {
  const sizes = { sm: "size-8", md: "size-11", lg: "size-14" };
  return (
    <span
      className={cx(
        "grid shrink-0 place-items-center rounded-full",
        inverse ? "bg-on-contrast text-contrast" : "bg-primary text-on-primary",
        sizes[size],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Card({
  className,
  children,
  tone = "surface",
  as: Tag = "section",
}: {
  className?: string;
  children: ReactNode;
  tone?: "surface" | "contrast";
  as?: "section" | "div" | "article";
}) {
  return (
    <Tag
      className={cx(
        "rounded-[28px] p-6 sm:p-7",
        tone === "surface"
          ? "bg-surface/90 shadow-card backdrop-blur-xl"
          : "bg-contrast text-on-contrast ring-1 ring-contrast-line",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export function SectionTitle({
  children,
  hint,
  action,
  onContrast,
}: {
  children: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
  onContrast?: boolean;
}) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div>
        <h2 className="text-lg font-normal tracking-tight">{children}</h2>
        {hint && (
          <p className={cx("mt-0.5 text-xs", onContrast ? "text-contrast-muted" : "text-muted")}>
            {hint}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

export function Eyebrow({ children, onContrast }: { children: ReactNode; onContrast?: boolean }) {
  return (
    <p
      className={cx(
        "text-[11px] font-medium uppercase tracking-[0.08em]",
        onContrast ? "text-contrast-muted" : "text-muted",
      )}
    >
      {children}
    </p>
  );
}

/** solid = black pill, outline = hairline pill, dashed = uncertain, soft = grey chip. */
export function Badge({
  children,
  tone = "soft",
  onContrast,
}: {
  children: ReactNode;
  tone?: "solid" | "outline" | "dashed" | "soft";
  onContrast?: boolean;
}) {
  const tones = onContrast
    ? {
        solid: "bg-on-contrast text-contrast",
        outline: "ring-1 ring-on-contrast/60 text-on-contrast",
        dashed: "border border-dashed border-on-contrast/50 text-on-contrast",
        soft: "bg-white/10 text-on-contrast",
      }
    : {
        solid: "bg-primary text-on-primary",
        outline: "ring-1 ring-line-strong text-ink",
        dashed: "border border-dashed border-line-strong text-muted",
        soft: "bg-subtle text-ink",
      };
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function Skeleton({ className, onContrast }: { className?: string; onContrast?: boolean }) {
  return (
    <div
      aria-hidden
      className={cx(
        "animate-pulse rounded-2xl",
        onContrast ? "bg-white/10" : "bg-subtle",
        className,
      )}
    />
  );
}

export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
  retrying,
  onContrast,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
  retrying?: boolean;
  onContrast?: boolean;
}) {
  return (
    <div
      role="alert"
      className={cx(
        "flex flex-col items-start gap-4 rounded-3xl p-5 text-sm sm:flex-row sm:items-center",
        onContrast ? "bg-white/5 ring-1 ring-contrast-line" : "bg-surface shadow-card",
      )}
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-rose-500/10 text-rose-500">
        <AlertTriangle className="size-5" aria-hidden />
      </span>
      <div className="flex-1">
        <p className="font-medium">{title}</p>
        <p className={onContrast ? "text-contrast-muted" : "text-muted"}>{message}</p>
      </div>
      {onRetry && (
        <Button variant={onContrast ? "inverse" : "primary"} onClick={onRetry} loading={retrying}>
          {!retrying && <RotateCw className="size-4" aria-hidden />}
          Try again
        </Button>
      )}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
  onContrast,
}: {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  onContrast?: boolean;
}) {
  return (
    <div className="flex flex-col items-center px-4 py-10 text-center">
      <IconCircle size="lg" inverse={onContrast}>
        {icon}
      </IconCircle>
      <h3 className="mt-5 text-lg font-normal tracking-tight">{title}</h3>
      {children && (
        <p className={cx("mt-1 max-w-xs text-sm", onContrast ? "text-contrast-muted" : "text-muted")}>
          {children}
        </p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function PageHeader({
  title,
  meta,
  action,
}: {
  title: string;
  meta?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-4xl font-light tracking-tight sm:text-5xl">{title}</h1>
        {meta && (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs uppercase tracking-[0.08em] text-muted">
            {meta}
          </div>
        )}
      </div>
      {action}
    </header>
  );
}

export { cx };
