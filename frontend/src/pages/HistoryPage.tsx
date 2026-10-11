import { History, ScanSearch, Sparkles, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Button, Card, EmptyState, Eyebrow, IconCircle, PageHeader, SectionTitle } from "../components/ui";
import { useHistory, type HistoryEntry } from "../hooks/useHistory";
import { confidenceLevel, formatDate, pct, relativeTime, titleCase } from "../lib/format";

export function HistoryPage() {
  const { entries, remove, clear } = useHistory();
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="space-y-8">
      <PageHeader
        title="History"
        meta={
          <>
            <span>
              {entries.length} prediction{entries.length === 1 ? "" : "s"}
            </span>
            <span>Stored only in this browser</span>
          </>
        }
        action={
          entries.length > 0 &&
          (confirming ? (
            <div className="flex items-center gap-2">
              <Button
                variant="danger"
                onClick={() => {
                  clear();
                  setConfirming(false);
                }}
              >
                Yes, clear all
              </Button>
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button variant="secondary" onClick={() => setConfirming(true)}>
              <Trash2 className="size-4" aria-hidden />
              Clear history
            </Button>
          ))
        }
      />

      {entries.length === 0 ? (
        <Card>
          <EmptyState
            icon={<History className="size-6" aria-hidden />}
            title="Nothing here yet"
            action={
              <Link
                to="/"
                className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-on-primary hover:opacity-85"
              >
                <ScanSearch className="size-4" aria-hidden />
                Make your first prediction
              </Link>
            }
          >
            Every prediction you make is saved here so you can compare results across inputs and
            model versions.
          </EmptyState>
        </Card>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-12">
          <Card className="lg:col-span-8">
            <SectionTitle hint="Newest first">All predictions</SectionTitle>
            <ul className="space-y-2.5">
              {entries.map((e) => (
                <HistoryRow key={e.id} entry={e} onRemove={() => remove(e.id)} />
              ))}
            </ul>
          </Card>
          <Overview entries={entries} />
        </div>
      )}
    </div>
  );
}

function HistoryRow({ entry, onRemove }: { entry: HistoryEntry; onRemove: () => void }) {
  const { result, input } = entry;
  const level = confidenceLevel(result.confidence);
  const runnerUp = Object.entries(result.probabilities).sort((a, b) => b[1] - a[1])[1];

  return (
    <li className="group flex min-h-16 items-center gap-4 rounded-full py-1.5 pl-1.5 pr-3 ring-1 ring-line-strong transition hover:bg-subtle">
      {input.kind === "image" ? (
        <img src={input.thumbnail} alt={input.name} className="size-[52px] shrink-0 rounded-full object-cover" />
      ) : (
        <IconCircle className="!size-[52px]">
          <Sparkles className="size-4" aria-hidden />
        </IconCircle>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{titleCase(result.label)}</p>
        <p className="truncate text-xs text-muted">
          {input.kind === "text" ? `“${input.text}”` : input.name}
          {runnerUp && ` · then ${titleCase(runnerUp[0])} ${pct(runnerUp[1], 0)}`}
        </p>
      </div>
      <div className="hidden w-28 sm:block">
        <div className="mb-1 flex justify-between text-[11px] tabular-nums text-muted">
          <span>{pct(result.confidence, 0)}</span>
          <span>v{result.model_version}</span>
        </div>
        <span className="block h-[3px] overflow-hidden rounded-full bg-line">
          <span className="block h-full rounded-full bg-primary" style={{ width: `${result.confidence * 100}%` }} />
        </span>
      </div>
      <span className="sm:hidden">
        <Badge tone={level === "high" ? "solid" : level === "medium" ? "outline" : "dashed"}>
          {pct(result.confidence, 0)}
        </Badge>
      </span>
      <time
        dateTime={entry.createdAt}
        title={formatDate(entry.createdAt)}
        className="hidden w-24 text-right text-xs text-muted md:block"
      >
        {relativeTime(entry.createdAt)}
      </time>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${titleCase(result.label)} from history`}
        className="grid size-9 shrink-0 place-items-center rounded-full text-muted transition hover:bg-primary hover:text-on-primary"
      >
        <X className="size-4" aria-hidden />
      </button>
    </li>
  );
}

/** Black summary card with a white bar chart of predicted labels. */
function Overview({ entries }: { entries: HistoryEntry[] }) {
  const { avg, counts, max } = useMemo(() => {
    const counts = new Map<string, number>();
    let sum = 0;
    for (const e of entries) {
      sum += e.result.confidence;
      counts.set(e.result.label, (counts.get(e.result.label) ?? 0) + 1);
    }
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    return { avg: sum / entries.length, counts: sorted, max: sorted[0]?.[1] ?? 1 };
  }, [entries]);

  return (
    <Card tone="contrast" className="lg:sticky lg:top-28 lg:col-span-4">
      <SectionTitle onContrast hint="Across everything in your history">
        Overview
      </SectionTitle>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Eyebrow onContrast>Predictions</Eyebrow>
          <p className="mt-1 text-4xl font-light tabular-nums">{entries.length}</p>
        </div>
        <div>
          <Eyebrow onContrast>Avg. confidence</Eyebrow>
          <p className="mt-1 text-4xl font-light tabular-nums">{pct(avg, 0)}</p>
        </div>
      </div>

      <div className="mt-8">
        <Eyebrow onContrast>Most predicted</Eyebrow>
        <div className="mt-4 flex h-40 items-end gap-3" role="list">
          {counts.map(([label, n]) => (
            <div key={label} role="listitem" className="flex min-w-0 flex-1 flex-col items-center gap-2">
              <span className="text-[11px] tabular-nums text-contrast-muted">{n}</span>
              {/* striped bars echo the reference's "Development" chart */}
              <span
                className="w-full rounded-sm bg-[repeating-linear-gradient(to_top,var(--on-contrast)_0_3px,transparent_3px_6px)]"
                style={{ height: `${Math.max((n / max) * 100, 8)}px` }}
                aria-label={`${titleCase(label)}: ${n}`}
              />
              <span className="w-full truncate text-center text-[10px] uppercase tracking-wide text-contrast-muted">
                {titleCase(label)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
