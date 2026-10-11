import { Activity, CalendarClock, Container, GitCommit, Server, Tags } from "lucide-react";
import type { ReactNode } from "react";
import { Badge, Card, ErrorState, SectionTitle, Skeleton } from "../components/ui";
import { useConfig, useHealth, useVersion } from "../hooks/useModel";
import { formatDate, pct, relativeTime, titleCase } from "../lib/format";

function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <Card as="div" className="!p-5">
      <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{sub}</p>}
    </Card>
  );
}

function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-3">
      <span className="mt-0.5 text-slate-400">{icon}</span>
      <dt className="w-32 shrink-0 text-sm text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="min-w-0 flex-1 break-words text-sm font-medium">{children}</dd>
    </div>
  );
}

// Metrics are fractions (accuracy), counts (num_samples) or plain floats (loss).
const formatMetric = (name: string, v: number) => {
  if (/acc|precision|recall|f1/i.test(name) && v <= 1) return pct(v);
  if (Number.isInteger(v)) return v.toLocaleString();
  return v.toFixed(4);
};

export function ModelPage() {
  const version = useVersion();
  const health = useHealth();
  const config = useConfig();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Model</h1>
        <p className="mt-1 text-slate-600 dark:text-slate-400">
          What's deployed right now, and how well it scored on held-out test data.
        </p>
      </header>

      {version.isPending ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
          <Skeleton className="h-64 sm:col-span-3" />
        </div>
      ) : version.isError ? (
        <ErrorState
          title="Can't load model details"
          message={version.error.message}
          onRetry={() => version.refetch()}
          retrying={version.isFetching}
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat
              label="Status"
              value={
                health.isError ? (
                  <span className="text-rose-600 dark:text-rose-400">Offline</span>
                ) : health.isPending ? (
                  "…"
                ) : (
                  <span className="text-emerald-600 dark:text-emerald-400">Online</span>
                )
              }
              sub={health.dataUpdatedAt ? `Checked ${relativeTime(new Date(health.dataUpdatedAt).toISOString())}` : undefined}
            />
            <Stat
              label="Model"
              value={`${version.data.model_name.toUpperCase()} v${version.data.model_version}`}
              sub={`${titleCase(version.data.input_type)} classifier`}
            />
            <Stat
              label="Test accuracy"
              value={
                version.data.test_metrics?.test_accuracy !== undefined
                  ? pct(version.data.test_metrics.test_accuracy)
                  : "n/a"
              }
              sub={`Across ${version.data.labels.length} classes`}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <SectionTitle>Deployment details</SectionTitle>
              <dl className="divide-y divide-slate-100 dark:divide-slate-800">
                <Row icon={<GitCommit className="size-4" />} label="Git commit">
                  {version.data.git_commit ? (
                    <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs dark:bg-slate-800">
                      {version.data.git_commit.slice(0, 12)}
                    </code>
                  ) : (
                    "unknown"
                  )}
                </Row>
                <Row icon={<CalendarClock className="size-4" />} label="Published">
                  {version.data.pushed_at
                    ? `${formatDate(version.data.pushed_at)} (${relativeTime(version.data.pushed_at)})`
                    : "unknown"}
                </Row>
                <Row icon={<Container className="size-4" />} label="Server image">
                  {version.data.image_tag ?? "unknown"}
                </Row>
                <Row icon={<Server className="size-4" />} label="Backend">
                  {config.data?.backend ?? "hidden"}
                </Row>
              </dl>
            </Card>

            <Card>
              <SectionTitle>
                <span className="inline-flex items-center gap-2">
                  <Activity className="size-4" aria-hidden /> Test metrics
                </span>
              </SectionTitle>
              {version.data.test_metrics && Object.keys(version.data.test_metrics).length > 0 ? (
                <dl className="divide-y divide-slate-100 dark:divide-slate-800">
                  {Object.entries(version.data.test_metrics).map(([k, v]) => (
                    <div key={k} className="flex justify-between py-2.5 text-sm">
                      <dt className="text-slate-500 dark:text-slate-400">{titleCase(k)}</dt>
                      <dd className="font-medium tabular-nums">
                        {typeof v === "number" ? formatMetric(k, v) : String(v)}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No metrics were published with this version.
                </p>
              )}
            </Card>
          </div>

          <Card>
            <SectionTitle hint="The model always answers with one of these.">
              <span className="inline-flex items-center gap-2">
                <Tags className="size-4" aria-hidden /> Classes
              </span>
            </SectionTitle>
            <div className="flex flex-wrap gap-2">
              {version.data.labels.map((l, i) => (
                <Badge key={l} tone="brand">
                  <span className="opacity-60">{i}</span> {titleCase(l)}
                </Badge>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
