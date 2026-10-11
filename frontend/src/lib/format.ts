export const pct = (p: number, digits = 1) => `${(p * 100).toFixed(digits)}%`;

export const titleCase = (s: string) =>
  s.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export type ConfidenceLevel = "high" | "medium" | "low";

export function confidenceLevel(p: number): ConfidenceLevel {
  if (p >= 0.75) return "high";
  if (p >= 0.45) return "medium";
  return "low";
}

export const confidenceCopy: Record<ConfidenceLevel, { title: string; hint: string }> = {
  high: { title: "Very confident", hint: "The model strongly prefers this class." },
  medium: { title: "Fairly sure", hint: "A likely answer, but the runner-up is plausible too." },
  low: {
    title: "Not sure",
    hint: "The model is guessing. The image may show something outside its classes.",
  },
};

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

export function relativeTime(iso: string): string {
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000;
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return "just now";
}

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
