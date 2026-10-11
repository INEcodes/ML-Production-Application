import {
  ArrowUpRight,
  CircleHelp,
  Gauge,
  History as HistoryIcon,
  Layers,
  RotateCcw,
  Send,
  Sparkles,
  Tag,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Dropzone } from "../components/Dropzone";
import { ProbabilityBars } from "../components/ProbabilityBars";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Eyebrow,
  IconCircle,
  PageHeader,
  SectionTitle,
  Skeleton,
} from "../components/ui";
import { useHistory, type HistoryEntry } from "../hooks/useHistory";
import { usePredict, useVersion } from "../hooks/useModel";
import { confidenceCopy, confidenceLevel, pct, relativeTime, titleCase } from "../lib/format";
import { prepareImage, type PreparedImage } from "../lib/image";
import type { PredictResponse, VersionResponse } from "../types/api";

const TEXT_EXAMPLES = [
  "Stocks rallied after the central bank held interest rates steady.",
  "The striker scored twice as the home side won the championship final.",
  "Researchers unveiled a chip that runs neural networks on a fraction of the power.",
  "Leaders met in Geneva to negotiate a ceasefire along the disputed border.",
];

export function ClassifyPage() {
  const version = useVersion();
  const today = new Date().toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });

  return (
    <div className="space-y-8">
      <PageHeader
        title="Classify"
        meta={
          <>
            <span>{today}</span>
            {version.data && (
              <span>
                {version.data.model_name.toUpperCase()} · v{version.data.model_version} ·{" "}
                {version.data.input_type} model
              </span>
            )}
          </>
        }
      />

      {version.isPending ? (
        <div className="grid gap-5 lg:grid-cols-12">
          <Skeleton className="h-96 lg:col-span-7" />
          <Skeleton className="h-96 lg:col-span-5" />
        </div>
      ) : version.isError ? (
        <ErrorState
          title="Can't reach the model API"
          message={`${version.error.message} The server may be restarting after a deploy; this usually takes under a minute.`}
          onRetry={() => version.refetch()}
          retrying={version.isFetching}
        />
      ) : (
        <Classifier model={version.data} />
      )}
    </div>
  );
}

function Classifier({ model }: { model: VersionResponse }) {
  const prediction = usePredict();
  const history = useHistory();
  const [image, setImage] = useState<(PreparedImage & { name: string }) | null>(null);
  const [text, setText] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const isImage = model.input_type === "image";

  const classifyImage = useCallback(
    async (file: File) => {
      setInputError(null);
      prediction.reset();
      let prepared: PreparedImage;
      try {
        prepared = await prepareImage(file);
      } catch (e) {
        setImage(null);
        setInputError((e as Error).message);
        return;
      }
      const name = file.name || "Pasted image";
      setImage({ ...prepared, name });
      // Classify straight away: picking an image is the intent, no extra click needed.
      prediction.mutate(
        { image_base64: prepared.base64 },
        {
          onSuccess: (result) =>
            history.add({ kind: "image", thumbnail: prepared.thumbnail, name }, result),
        },
      );
    },
    [prediction, history],
  );

  const classifyText = () => {
    const value = text.trim();
    if (!value) return;
    prediction.mutate(
      { text: value },
      { onSuccess: (result) => history.add({ kind: "text", text: value }, result) },
    );
  };

  // Paste an image from the clipboard anywhere on the page.
  useEffect(() => {
    if (!isImage) return;
    const onPaste = (e: ClipboardEvent) => {
      const file = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith("image/"));
      if (file) {
        e.preventDefault();
        void classifyImage(file);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [isImage, classifyImage]);

  const reset = () => {
    setImage(null);
    setText("");
    setInputError(null);
    prediction.reset();
  };

  return (
    <div className="grid items-start gap-5 lg:grid-cols-12">
      {/* ---- input ---- */}
      <Card className="lg:col-span-7">
        <SectionTitle
          hint={isImage ? "Step 1 · pick an image" : "Step 1 · enter some text"}
          action={
            (image || text) && (
              <Button variant="ghost" className="h-9 px-3" onClick={reset} disabled={prediction.isPending}>
                <X className="size-4" aria-hidden /> Clear
              </Button>
            )
          }
        >
          Your input
        </SectionTitle>

        {isImage ? (
          image ? (
            <div className="space-y-4">
              <div className="overflow-hidden rounded-[24px] bg-subtle">
                <img
                  src={image.previewUrl}
                  alt={`Selected: ${image.name}`}
                  className="mx-auto max-h-[22rem] object-contain"
                />
              </div>
              <p className="truncate px-1 text-[11px] uppercase tracking-[0.08em] text-muted">
                {image.name} · {image.width}×{image.height}px
              </p>
              <Dropzone onFile={classifyImage} disabled={prediction.isPending} compact />
            </div>
          ) : (
            <Dropzone onFile={classifyImage} disabled={prediction.isPending} />
          )
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              classifyText();
            }}
          >
            <label htmlFor="text-input" className="sr-only">
              Text to classify
            </label>
            <textarea
              id="text-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) classifyText();
              }}
              rows={6}
              maxLength={10_000}
              placeholder="Paste a headline or a short article…"
              className="w-full resize-y rounded-[24px] bg-subtle p-5 text-[15px] placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ink"
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-[11px] uppercase tracking-[0.08em] text-muted">
                {text.length.toLocaleString()} / 10,000 · Ctrl/⌘ + Enter
              </span>
              <Button type="submit" loading={prediction.isPending} disabled={!text.trim()}>
                {!prediction.isPending && <Send className="size-4" aria-hidden />}
                Classify
              </Button>
            </div>
            <div className="space-y-2 pt-2">
              <Eyebrow>Or try an example</Eyebrow>
              {TEXT_EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => setText(ex)}
                  className="flex h-12 w-full items-center gap-3 rounded-full py-1 pl-1 pr-5 text-left text-sm ring-1 ring-line-strong transition hover:bg-subtle"
                >
                  <IconCircle size="sm" className="!size-10">
                    <Sparkles className="size-4" aria-hidden />
                  </IconCircle>
                  <span className="truncate">{ex}</span>
                </button>
              ))}
            </div>
          </form>
        )}

        {inputError && (
          <div className="mt-4">
            <ErrorState title="That file didn't work" message={inputError} />
          </div>
        )}
      </Card>

      {/* ---- result (black feature card) ---- */}
      <Card tone="contrast" className="min-h-[24rem] lg:sticky lg:top-28 lg:col-span-5">
        <SectionTitle onContrast hint="Step 2 · what the model thinks">
          Result
        </SectionTitle>
        <ResultPanel
          pending={prediction.isPending}
          error={prediction.error}
          result={prediction.data}
          onRetry={() => prediction.variables && prediction.mutate(prediction.variables)}
          onReset={reset}
          isImage={isImage}
        />
      </Card>

      {/* ---- model strip ---- */}
      <Card className="lg:col-span-7">
        <SectionTitle
          hint="What this model can recognise"
          action={
            <Link to="/model" aria-label="Model details">
              <IconCircle size="sm">
                <ArrowUpRight className="size-4" aria-hidden />
              </IconCircle>
            </Link>
          }
        >
          Model
        </SectionTitle>
        <div className="grid gap-5 sm:grid-cols-3">
          <Metric
            icon={<Gauge className="size-4" aria-hidden />}
            label="Test accuracy"
            value={
              model.test_metrics?.test_accuracy !== undefined ? pct(model.test_metrics.test_accuracy) : "n/a"
            }
            fill={model.test_metrics?.test_accuracy}
          />
          <Metric icon={<Layers className="size-4" aria-hidden />} label="Classes" value={String(model.labels.length)} />
          <Metric
            icon={<Tag className="size-4" aria-hidden />}
            label="Version"
            value={`v${model.model_version}`}
          />
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          {model.labels.map((l) => (
            <Badge key={l} tone="outline">
              {titleCase(l)}
            </Badge>
          ))}
        </div>
        {isImage && (
          <p className="mt-5 text-xs text-muted">
            Best results: one clear subject, centred, filling most of the frame. Images are shrunk
            to 32×32 before the model sees them.
          </p>
        )}
      </Card>

      {/* ---- recent ---- */}
      <RecentCard entries={history.entries.slice(0, 4)} />
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  fill,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  fill?: number;
}) {
  return (
    <div className="flex items-center gap-3">
      <IconCircle size="sm" className="!size-10">
        {icon}
      </IconCircle>
      <div className="min-w-0 flex-1">
        <Eyebrow>{label}</Eyebrow>
        <div className="flex items-center gap-3">
          <span className="text-xl font-light tabular-nums">{value}</span>
          {fill !== undefined && (
            <span className="h-[3px] flex-1 overflow-hidden rounded-full bg-line">
              <span className="block h-full rounded-full bg-primary" style={{ width: `${fill * 100}%` }} />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function RecentCard({ entries }: { entries: HistoryEntry[] }) {
  return (
    <Card className="lg:col-span-5">
      <SectionTitle
        hint="Your latest predictions"
        action={
          <Link to="/history" aria-label="All history">
            <IconCircle size="sm">
              <ArrowUpRight className="size-4" aria-hidden />
            </IconCircle>
          </Link>
        }
      >
        Recent
      </SectionTitle>
      {entries.length === 0 ? (
        <div className="flex h-14 items-center gap-3 rounded-full py-1 pl-1 pr-5 text-sm text-muted border border-dashed border-line-strong">
          <IconCircle size="sm" className="!size-11 !bg-subtle !text-muted">
            <HistoryIcon className="size-4" aria-hidden />
          </IconCircle>
          Nothing yet. Results will show up here.
        </div>
      ) : (
        <ul className="space-y-2.5">
          {entries.map((e) => (
            <li
              key={e.id}
              className="flex h-14 items-center gap-3 rounded-full py-1 pl-1 pr-5 ring-1 ring-line-strong"
            >
              {e.input.kind === "image" ? (
                <img src={e.input.thumbnail} alt="" className="size-11 shrink-0 rounded-full object-cover" />
              ) : (
                <IconCircle size="sm" className="!size-11">
                  <Sparkles className="size-4" aria-hidden />
                </IconCircle>
              )}
              <span className="min-w-0 flex-1 truncate text-sm">{titleCase(e.result.label)}</span>
              <span className="text-xs tabular-nums text-muted">{pct(e.result.confidence, 0)}</span>
              <span className="hidden text-xs text-muted sm:inline">{relativeTime(e.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function ResultPanel({
  pending,
  error,
  result,
  onRetry,
  onReset,
  isImage,
}: {
  pending: boolean;
  error: Error | null;
  result: PredictResponse | undefined;
  onRetry: () => void;
  onReset: () => void;
  isImage: boolean;
}) {
  if (pending) {
    return (
      <div aria-live="polite" className="space-y-5">
        <p className="flex items-center gap-2 text-xs uppercase tracking-[0.08em] text-contrast-muted">
          <Sparkles className="size-4 animate-pulse" aria-hidden />
          Asking the model…
        </p>
        <Skeleton onContrast className="h-12 w-2/3" />
        <div className="space-y-4 pt-4">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} onContrast className="h-2" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return <ErrorState onContrast title="Prediction failed" message={error.message} onRetry={onRetry} />;
  }

  if (!result) {
    return (
      <EmptyState onContrast icon={<CircleHelp className="size-6" aria-hidden />} title="No prediction yet">
        {isImage
          ? "Upload, drop or paste an image. The answer appears here instantly."
          : "Type or pick an example, then press Classify."}
      </EmptyState>
    );
  }

  const level = confidenceLevel(result.confidence);
  const copy = confidenceCopy[level];

  return (
    <div aria-live="polite" className="space-y-8">
      <div>
        <Eyebrow onContrast>It looks like</Eyebrow>
        <p className="mt-2 text-5xl font-light tracking-tight">{titleCase(result.label)}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Badge onContrast tone={level === "high" ? "solid" : level === "medium" ? "outline" : "dashed"}>
            {copy.title}
          </Badge>
          <Badge onContrast tone="soft">{pct(result.confidence)} confidence</Badge>
        </div>
        <p className="mt-3 text-sm text-contrast-muted">{copy.hint}</p>
      </div>

      <div>
        <div className="mb-4">
          <Eyebrow onContrast>Top guesses</Eyebrow>
        </div>
        <ProbabilityBars onContrast probabilities={result.probabilities} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-contrast-line pt-5">
        <span className="text-[11px] uppercase tracking-[0.08em] text-contrast-muted">
          {result.model_name} · v{result.model_version} · saved to history
        </span>
        <Button variant="inverse" onClick={onReset}>
          <RotateCcw className="size-4" aria-hidden />
          Start over
        </Button>
      </div>
    </div>
  );
}
