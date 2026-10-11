import { useState } from "react";
import { pct, titleCase } from "../lib/format";
import { cx } from "./ui";

/** Thin labelled progress lines, styled after the reference's "PROGRESS ——— 70%" rows. */
export function ProbabilityBars({
  probabilities,
  initial = 5,
  onContrast,
}: {
  probabilities: Record<string, number>;
  initial?: number;
  onContrast?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const sorted = Object.entries(probabilities).sort((a, b) => b[1] - a[1]);
  const shown = expanded ? sorted : sorted.slice(0, initial);
  const muted = onContrast ? "text-contrast-muted" : "text-muted";

  return (
    <div>
      <ul className="space-y-4">
        {shown.map(([name, p], i) => (
          <li key={name}>
            <div className="mb-1.5 flex items-baseline justify-between text-[11px] uppercase tracking-[0.08em]">
              <span className={i === 0 ? "font-semibold" : muted}>{titleCase(name)}</span>
              <span className={cx("tabular-nums", i === 0 ? "font-semibold" : muted)}>{pct(p)}</span>
            </div>
            <span
              className={cx(
                "block h-[3px] overflow-hidden rounded-full",
                onContrast ? "bg-white/15" : "bg-line",
              )}
              role="meter"
              aria-label={`${titleCase(name)} probability`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(p * 100)}
            >
              <span
                className={cx(
                  "block h-full rounded-full transition-[width] duration-700",
                  onContrast
                    ? i === 0
                      ? "bg-on-contrast"
                      : "bg-on-contrast/45"
                    : i === 0
                      ? "bg-primary"
                      : "bg-primary/40",
                )}
                style={{ width: `${Math.max(p * 100, 0.75)}%` }}
              />
            </span>
          </li>
        ))}
      </ul>
      {sorted.length > initial && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className={cx(
            "mt-5 text-xs font-medium underline-offset-4 hover:underline",
            onContrast ? "text-on-contrast" : "text-ink",
          )}
        >
          {expanded ? "Show top results only" : `Show all ${sorted.length} classes`}
        </button>
      )}
    </div>
  );
}
