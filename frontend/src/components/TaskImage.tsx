// Renders an <img> whose source may be a `task-image:<path>` reference
// requiring signed-URL resolution before display. External URLs and
// placeholder/empty srcs render as plain <img> immediately.
//
// While the signed URL is in flight we render a shape-matching skeleton so
// the surrounding layout doesn't shift; on failure we render a small
// fallback chip instead of the browser's broken-image icon.

import { useEffect, useState } from "react";

import {
  isTaskImageUrl,
  resolveTaskImageUrl,
  taskImagePath,
} from "@/lib/resolveTaskImageUrl";

type Props = {
  src?: string;
  alt?: string;
  className?: string;
  // Receives the *resolved* signed URL (suitable for lightbox display)
  // rather than the raw `task-image:` reference.
  onClick?: (resolvedUrl: string) => void;
};

export function TaskImage({ src, alt, className, onClick }: Props) {
  const [resolved, setResolved] = useState<string | null>(
    src && isTaskImageUrl(src) ? null : (src ?? null),
  );
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!src) {
      setResolved(null);
      setError(false);
      return;
    }
    if (!isTaskImageUrl(src)) {
      setResolved(src);
      setError(false);
      return;
    }
    let cancelled = false;
    setResolved(null);
    setError(false);
    resolveTaskImageUrl(taskImagePath(src))
      .then((url) => {
        if (!cancelled) setResolved(url);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [src]);

  if (error) {
    return (
      <span
        className={`inline-block bg-slate-100 dark:bg-slate-800 text-xs text-slate-500 dark:text-slate-400 px-2 py-1 rounded ${className ?? ""}`}
      >
        Image failed to load
      </span>
    );
  }
  if (!resolved) {
    return (
      <span
        className={`inline-block animate-pulse bg-slate-200 dark:bg-slate-700 rounded ${className ?? ""}`}
        aria-label={alt || "loading image"}
      />
    );
  }
  return (
    <img
      src={resolved}
      alt={alt ?? ""}
      loading="lazy"
      onClick={onClick ? () => onClick(resolved) : undefined}
      onError={() => setError(true)}
      className={className}
    />
  );
}
