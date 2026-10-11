import { History, Sparkles, Trash2, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Button, Card, EmptyState } from "../components/ui";
import { useHistory, type HistoryEntry } from "../hooks/useHistory";
import { confidenceLevel, formatDate, pct, relativeTime, titleCase } from "../lib/format";

export function HistoryPage() {
  const { entries, remove, clear } = useHistory();
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">History</h1>
          <p className="mt-1 text-slate-600 dark:text-slate-400">
            Your last {entries.length > 0 ? entries.length : ""} predictions. Stored only in this
            browser.
          </p>
        </div>
        {entries.length > 0 &&
          (confirming ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-600 dark:text-slate-400">Clear everything?</span>
              <Button
                variant="danger"
                onClick={() => {
                  clear();
                  setConfirming(false);
                }}
              >
                Yes, clear
              </Button>
              <Button variant="ghost" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button variant="secondary" onClick={() => setConfirming(true)}>
              <Trash2 className="size-4" aria-hidden />
              Clear history
            </Button>
          ))}
      </header>

      {entries.length === 0 ? (
        <Card>
          <EmptyState
            icon={<History className="size-7" aria-hidden />}
            title="Nothing here yet"
            action={
              <Link
                to="/"
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500"
              >
                <Sparkles className="size-4" aria-hidden />
                Make your first prediction
              </Link>
            }
          >
            Every prediction you make is saved here so you can compare results across images and
            model versions.
          </EmptyState>
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map((e) => (
            <HistoryCard key={e.id} entry={e} onRemove={() => remove(e.id)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function HistoryCard({ entry, onRemove }: { entry: HistoryEntry; onRemove: () => void }) {
  const { result, input } = entry;
  const level = confidenceLevel(result.confidence);
  const runnersUp = Object.entries(result.probabilities)
    .sort((a, b) => b[1] - a[1])
    .slice(1, 3);

  return (
    <li className="group relative flex gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      {input.kind === "image" ? (
        <img
          src={input.thumbnail}
          alt={input.name}
          className="size-20 shrink-0 rounded-xl object-cover"
        />
      ) : (
        <p className="line-clamp-4 h-20 w-24 shrink-0 rounded-xl bg-slate-50 p-2 text-[11px] leading-snug text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {input.text}
        </p>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{titleCase(result.label)}</p>
        <div className="mt-1">
          <Badge tone={level === "high" ? "success" : level === "medium" ? "warning" : "danger"}>
            {pct(result.confidence)} confident
          </Badge>
        </div>
        {runnersUp.length > 0 && (
          <p className="mt-2 truncate text-xs text-slate-500 dark:text-slate-400">
            then {runnersUp.map(([n, p]) => `${titleCase(n)} ${pct(p, 0)}`).join(", ")}
          </p>
        )}
        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
          <time dateTime={entry.createdAt} title={formatDate(entry.createdAt)}>
            {relativeTime(entry.createdAt)}
          </time>{" "}
          · v{result.model_version}
        </p>
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove from history"
        className="absolute right-2 top-2 grid size-7 place-items-center rounded-full text-slate-400 opacity-100 hover:bg-slate-100 hover:text-slate-700 focus:opacity-100 dark:hover:bg-slate-800 dark:hover:text-slate-200 sm:opacity-0 sm:group-hover:opacity-100"
      >
        <X className="size-4" aria-hidden />
      </button>
    </li>
  );
}
