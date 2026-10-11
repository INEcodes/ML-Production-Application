import { CheckCircle2, CircleHelp, Lightbulb, RotateCcw, Send, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Dropzone } from "../components/Dropzone";
import { ProbabilityBars } from "../components/ProbabilityBars";
import { Badge, Button, Card, EmptyState, ErrorState, SectionTitle, Skeleton } from "../components/ui";
import { useHistory } from "../hooks/useHistory";
import { usePredict, useVersion } from "../hooks/useModel";
import { confidenceCopy, confidenceLevel, pct, titleCase } from "../lib/format";
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

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {version.data?.input_type === "text" ? "Classify a piece of text" : "Classify an image"}
        </h1>
        <p className="mt-1 text-slate-600 dark:text-slate-400">
          {version.data?.input_type === "text"
            ? "Paste a headline or short article and the model predicts its topic."
            : "Upload a photo and the model tells you what it sees, with how sure it is."}
        </p>
      </header>

      {version.isPending ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
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
      setImage({ ...prepared, name: file.name || "Pasted image" });
      // Classify straight away: picking an image is the intent, no extra click needed.
      prediction.mutate(
        { image_base64: prepared.base64 },
        {
          onSuccess: (result) =>
            history.add(
              { kind: "image", thumbnail: prepared.thumbnail, name: file.name || "Pasted image" },
              result,
            ),
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
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <Card>
        <SectionTitle hint={isImage ? "Step 1: pick an image" : "Step 1: enter some text"}>
          Your input
        </SectionTitle>

        {isImage ? (
          image ? (
            <div className="space-y-4">
              <div className="relative overflow-hidden rounded-xl bg-[repeating-conic-gradient(#e2e8f0_0_25%,transparent_0_50%)] bg-[length:16px_16px] dark:bg-[repeating-conic-gradient(#1e293b_0_25%,transparent_0_50%)]">
                <img
                  src={image.previewUrl}
                  alt={`Selected: ${image.name}`}
                  className="mx-auto max-h-80 object-contain"
                />
                <button
                  type="button"
                  onClick={reset}
                  disabled={prediction.isPending}
                  className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-slate-900/70 text-white hover:bg-slate-900 disabled:opacity-50"
                  aria-label="Remove image"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                {image.name} · {image.width}×{image.height}px
              </p>
              <Dropzone onFile={classifyImage} disabled={prediction.isPending} compact />
            </div>
          ) : (
            <Dropzone onFile={classifyImage} disabled={prediction.isPending} />
          )
        ) : (
          <form
            className="space-y-3"
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
              placeholder="e.g. Stocks rallied after the central bank held rates."
              className="w-full resize-y rounded-xl border border-slate-300 bg-white p-3 text-sm shadow-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-950"
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {text.length.toLocaleString()} / 10,000 · Ctrl/⌘ + Enter to submit
              </span>
              <Button type="submit" loading={prediction.isPending} disabled={!text.trim()}>
                {!prediction.isPending && <Send className="size-4" aria-hidden />}
                Classify
              </Button>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                Or try an example:
              </p>
              <div className="flex flex-wrap gap-2">
                {TEXT_EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => setText(ex)}
                    className="max-w-full truncate rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:border-indigo-400 hover:text-indigo-700 dark:border-slate-700 dark:text-slate-300 dark:hover:text-indigo-300"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          </form>
        )}

        {inputError && (
          <div className="mt-4">
            <ErrorState title="That file didn't work" message={inputError} />
          </div>
        )}

        <div className="mt-6 rounded-xl bg-slate-50 p-4 dark:bg-slate-800/50">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <Lightbulb className="size-4 text-amber-500" aria-hidden />
            The model knows {model.labels.length} classes
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {model.labels.map((l) => (
              <Badge key={l}>{titleCase(l)}</Badge>
            ))}
          </div>
          {isImage && (
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              Best results: one clear subject, centered, filling most of the frame. Images are
              shrunk to tiny thumbnails before the model sees them.
            </p>
          )}
        </div>
      </Card>

      <Card className="lg:sticky lg:top-24">
        <SectionTitle hint="Step 2: see what the model thinks">Result</SectionTitle>
        <ResultPanel
          pending={prediction.isPending}
          error={prediction.error}
          result={prediction.data}
          onRetry={() => prediction.variables && prediction.mutate(prediction.variables)}
          onReset={reset}
          isImage={isImage}
        />
      </Card>
    </div>
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
      <div aria-live="polite" className="space-y-4">
        <p className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Sparkles className="size-4 animate-pulse text-indigo-500" aria-hidden />
          Asking the model…
        </p>
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
        <div className="space-y-3 pt-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-3" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return <ErrorState title="Prediction failed" message={error.message} onRetry={onRetry} />;
  }

  if (!result) {
    return (
      <EmptyState icon={<CircleHelp className="size-7" aria-hidden />} title="No prediction yet">
        {isImage
          ? "Upload, drop or paste an image on the left. Results appear here instantly."
          : "Type or pick an example on the left, then press Classify."}
      </EmptyState>
    );
  }

  const level = confidenceLevel(result.confidence);
  const copy = confidenceCopy[level];
  const tone = level === "high" ? "success" : level === "medium" ? "warning" : "danger";

  return (
    <div aria-live="polite" className="space-y-6">
      <div>
        <p className="text-sm text-slate-500 dark:text-slate-400">It looks like</p>
        <p className="mt-1 flex flex-wrap items-center gap-3 text-3xl font-bold tracking-tight sm:text-4xl">
          {titleCase(result.label)}
          <Badge tone={tone}>
            {level === "high" && <CheckCircle2 className="size-3.5" aria-hidden />}
            {copy.title} · {pct(result.confidence)}
          </Badge>
        </p>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{copy.hint}</p>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-medium">Top guesses</h3>
        <ProbabilityBars probabilities={result.probabilities} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {result.model_name.toUpperCase()} · model v{result.model_version} · saved to History
        </span>
        <Button variant="secondary" onClick={onReset}>
          <RotateCcw className="size-4" aria-hidden />
          Start over
        </Button>
      </div>
    </div>
  );
}
