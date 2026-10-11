import { Plus, Upload } from "lucide-react";
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

  const open = () => !disabled && input.current?.click();

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      aria-label="Choose an image to classify"
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cx(
        "group cursor-pointer transition",
        compact
          ? "flex h-14 items-center gap-3 rounded-full py-1.5 pl-1.5 pr-5 ring-1 ring-line-strong hover:bg-subtle"
          : "flex flex-col items-center justify-center gap-5 rounded-[24px] bg-subtle px-6 py-14 text-center",
        dragging && (compact ? "bg-subtle ring-ink" : "ring-2 ring-ink"),
        disabled && "pointer-events-none opacity-50",
      )}
    >
      {compact ? (
        <>
          <span className="grid size-11 place-items-center rounded-full bg-primary text-on-primary">
            <Plus className="size-5" aria-hidden />
          </span>
          <span className="text-sm">Choose another image</span>
          <span className="ml-auto text-xs text-muted">or drop / paste</span>
        </>
      ) : (
        <>
          <span className="grid size-16 place-items-center rounded-full bg-primary text-on-primary transition group-hover:scale-105">
            <Upload className="size-6" aria-hidden />
          </span>
          <div>
            <p className="text-xl font-light tracking-tight">
              {dragging ? "Drop it here" : "Drop an image, or click to browse"}
            </p>
            <p className="mt-1.5 text-xs text-muted">
              PNG · JPEG · WebP · GIF. Paste works too: Ctrl/⌘ + V
            </p>
          </div>
        </>
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
