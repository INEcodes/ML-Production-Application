import { useState } from "react";
import { pct, titleCase } from "../lib/format";

export function ProbabilityBars({
  probabilities,
  initial = 5,
}: {
  probabilities: Record<string, number>;
  initial?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const sorted = Object.entries(probabilities).sort((a, b) => b[1] - a[1]);
  const shown = expanded ? sorted : sorted.slice(0, initial);

  return (
    <div>
      <ul className="space-y-2.5">
        {shown.map(([name, p], i) => (
          <li key={name} className="grid grid-cols-[7rem_1fr_3.5rem] items-center gap-3 text-sm">
            <span className={i === 0 ? "truncate font-medium" : "truncate text-slate-600 dark:text-slate-400"}>
              {titleCase(name)}
            </span>
            <span
              className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
              role="meter"
              aria-label={`${titleCase(name)} probability`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(p * 100)}
            >
              <span
                className={`block h-full rounded-full transition-[width] duration-500 ${
                  i === 0 ? "bg-indigo-600 dark:bg-indigo-400" : "bg-indigo-300 dark:bg-indigo-700"
                }`}
                style={{ width: `${Math.max(p * 100, 0.5)}%` }}
              />
            </span>
            <span className="text-right tabular-nums text-slate-600 dark:text-slate-400">
              {pct(p)}
            </span>
          </li>
        ))}
      </ul>
      {sorted.length > initial && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
        >
          {expanded ? "Show top results only" : `Show all ${sorted.length} classes`}
        </button>
      )}
    </div>
  );
}
