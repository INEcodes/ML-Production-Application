import { ImagePlus } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";
import { ACCEPTED_TYPES } from "../lib/image";
import { cx } from "./ui";

export function Dropzone({
  onFile,
  disabled,
  compact,
}: {
  onFile: (file: File) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && !disabled) onFile(file);
  };

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      aria-label="Choose an image to classify"
      onClick={() => !disabled && input.current?.click()}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !disabled) {
          e.preventDefault();
          input.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cx(
        "flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed text-center transition-colors",
        compact ? "gap-1 px-4 py-4" : "gap-3 px-6 py-12",
        dragging
          ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40"
          : "border-slate-300 hover:border-indigo-400 hover:bg-slate-50 dark:border-slate-700 dark:hover:border-indigo-500 dark:hover:bg-slate-800/50",
        disabled && "pointer-events-none opacity-60",
      )}
    >
      {!compact && (
        <div className="grid size-12 place-items-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300">
          <ImagePlus className="size-6" aria-hidden />
        </div>
      )}
      <p className="text-sm">
        <span className="font-semibold text-indigo-600 dark:text-indigo-400">
          {compact ? "Choose another image" : "Click to upload"}
        </span>{" "}
        <span className="text-slate-500 dark:text-slate-400">or drag and drop</span>
      </p>
      {!compact && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          PNG, JPEG, WebP, GIF. You can also paste with Ctrl/⌘ + V
        </p>
      )}
      <input
        ref={input}
        type="file"
        accept={ACCEPTED_TYPES}
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = ""; // allow re-selecting the same file
        }}
      />
    </div>
  );
}
