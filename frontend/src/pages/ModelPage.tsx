import { CalendarClock, Container, GitCommit, Server, Wifi } from "lucide-react";
import type { ReactNode } from "react";
import { Card, ErrorState, Eyebrow, IconCircle, PageHeader, SectionTitle, Skeleton } from "../components/ui";
import { useConfig, useHealth, useVersion } from "../hooks/useModel";
import { formatDate, pct, relativeTime, titleCase } from "../lib/format";

// Metrics are fractions (accuracy), counts (num_samples) or plain floats (loss).
const formatMetric = (name: string, v: number) => {
  if (/acc|precision|recall|f1/i.test(name) && v <= 1) return pct(v);
  if (Number.isInteger(v)) return v.toLocaleString();
  return v.toFixed(4);
};

/** Icon circle + label + value inside a hairline pill (the reference's file rows). */
function PillRow({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-14 items-center gap-3 rounded-full py-1 pl-1 pr-5 ring-1 ring-line-strong">
      <IconCircle size="sm" className="!size-11">
        {icon}
      </IconCircle>
      <span className="w-28 shrink-0 text-xs uppercase tracking-[0.08em] text-muted">{label}</span>
      <span className="min-w-0 flex-1 truncate text-right text-sm">{children}</span>
    </div>
  );
}

export function ModelPage() {
  const version = useVersion();
  const health = useHealth();
  const config = useConfig();

  return (
    <div className="space-y-8">
      <PageHeader
        title="Model"
        meta={
          version.data && (
            <>
              <span>
                {version.data.model_name.toUpperCase()} · v{version.data.model_version}
              </span>
              <span>{titleCase(version.data.input_type)} classifier</span>
            </>
          )
        }
      />

      {version.isPending ? (
        <div className="grid gap-5 lg:grid-cols-12">
          <Skeleton className="h-80 lg:col-span-5" />
          <Skeleton className="h-80 lg:col-span-7" />
        </div>
      ) : version.isError ? (
        <ErrorState
          title="Can't load model details"
          message={version.error.message}
          onRetry={() => version.refetch()}
          retrying={version.isFetching}
        />
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-12">
          <Card tone="contrast" className="lg:col-span-5">
            <SectionTitle onContrast hint="Scored on held-out test data">
              Performance
            </SectionTitle>
            <Eyebrow onContrast>Test accuracy</Eyebrow>
            <p className="mt-1 text-6xl font-light tracking-tight tabular-nums">
              {version.data.test_metrics?.test_accuracy !== undefined
                ? pct(version.data.test_metrics.test_accuracy)
                : "n/a"}
            </p>
            {version.data.test_metrics?.test_accuracy !== undefined && (
              <span className="mt-4 block h-[3px] overflow-hidden rounded-full bg-white/15">
                <span
                  className="block h-full rounded-full bg-on-contrast"
                  style={{ width: `${version.data.test_metrics.test_accuracy * 100}%` }}
                />
              </span>
            )}
            {version.data.test_metrics && (
              <dl className="mt-8 divide-y divide-contrast-line">
                {Object.entries(version.data.test_metrics).map(([k, v]) => (
                  <div key={k} className="flex justify-between py-3 text-sm">
                    <dt className="text-xs uppercase tracking-[0.08em] text-contrast-muted">{titleCase(k)}</dt>
                    <dd className="tabular-nums">{typeof v === "number" ? formatMetric(k, v) : String(v)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </Card>

          <Card className="lg:col-span-7">
            <SectionTitle hint="What's serving requests right now">Deployment</SectionTitle>
            <div className="space-y-2.5">
              <PillRow icon={<Wifi className="size-4" aria-hidden />} label="Status">
                <span className="inline-flex items-center gap-2">
                  <span
                    className={
                      health.isError
                        ? "size-2 rounded-full bg-rose-500"
                        : health.isPending
                          ? "size-2 animate-pulse rounded-full bg-muted"
                          : "size-2 rounded-full bg-emerald-500"
                    }
                  />
                  {health.isError ? "Offline" : health.isPending ? "Checking…" : "Online"}
                  {health.dataUpdatedAt > 0 && (
                    <span className="text-muted">
                      · checked {relativeTime(new Date(health.dataUpdatedAt).toISOString())}
                    </span>
                  )}
                </span>
              </PillRow>
              <PillRow icon={<GitCommit className="size-4" aria-hidden />} label="Git commit">
                <code className="text-xs">{version.data.git_commit?.slice(0, 12) ?? "unknown"}</code>
              </PillRow>
              <PillRow icon={<CalendarClock className="size-4" aria-hidden />} label="Published">
                {version.data.pushed_at ? (
                  <span title={formatDate(version.data.pushed_at)}>
                    {formatDate(version.data.pushed_at)}{" "}
                    <span className="text-muted">({relativeTime(version.data.pushed_at)})</span>
                  </span>
                ) : (
                  "unknown"
                )}
              </PillRow>
              <PillRow icon={<Container className="size-4" aria-hidden />} label="Server image">
                <code className="text-xs">{version.data.image_tag ?? "unknown"}</code>
              </PillRow>
              <PillRow icon={<Server className="size-4" aria-hidden />} label="Backend">
                {config.data?.backend ?? "hidden"}
              </PillRow>
            </div>
          </Card>

          <Card className="lg:col-span-12">
            <SectionTitle hint="The model always answers with one of these">
              Classes · {version.data.labels.length}
            </SectionTitle>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
              {version.data.labels.map((l, i) => (
                <div key={l} className="flex h-12 items-center gap-3 rounded-full py-1 pl-1 pr-4 ring-1 ring-line-strong">
                  <IconCircle size="sm" className="!size-10 text-xs tabular-nums">
                    {i}
                  </IconCircle>
                  <span className="truncate text-sm">{titleCase(l)}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
