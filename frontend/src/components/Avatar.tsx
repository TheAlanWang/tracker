import { isUploadedAvatar } from "@/lib/avatar";

type Props = {
  // Prefer display_name's first letter — user-controlled name reads more
  // naturally than email prefixes like "2alan@…" or "aw_personal@…".
  displayName?: string | null;
  email?: string | null;
  // Optional uploaded avatar URL. When present, renders as an <img>; falls
  // back to the colored-initial bubble below if absent or if the image
  // fails to load.
  avatarUrl?: string | null;
  // Optional explicit background color for the initial-letter bubble (e.g.
  // "#3b82f6"). When omitted, a hue is derived from the email hash so the
  // same person renders the same color in views that don't supply one.
  color?: string | null;
  size?: number;
  className?: string;
};

// Stable hash → hue so the same person gets the same color everywhere.
function hueFor(seed: string): number {
  return Array.from(seed).reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
}

function pickInitial(
  displayName?: string | null,
  email?: string | null,
): string {
  const name = displayName?.trim();
  if (name) return name[0]!.toUpperCase();
  if (email) return email[0]!.toUpperCase();
  return "?";
}

export function Avatar({
  displayName,
  email,
  avatarUrl,
  color,
  size = 24,
  className = "",
}: Props) {
  const initial = pickInitial(displayName, email);
  // User-picked color wins over the deterministic hash. Hash is the fallback
  // so views that don't supply a color (other users' avatars in members /
  // assignees lists) still show a stable, person-specific hue.
  const background = color ?? `hsl(${hueFor(email ?? displayName ?? "?")} 55% 50%)`;
  const title = displayName || email || "";
  // Ring in light mode (ring-2 ring-white) gives the avatar a clean cut-out
  // against light surfaces and white gaps when avatars stack. In dark mode
  // any ring color reads as a halo — neutral-900 looks like a black ring on
  // neutral-800 cards, neutral-800 would look pale on darker surfaces. No
  // single color matches every container, so drop the ring in dark mode and
  // let the saturated avatar bg provide the visual edge.
  const baseClass = `rounded-full overflow-hidden flex items-center justify-center text-white font-semibold shrink-0 ring-2 ring-white dark:ring-0 dark:opacity-90 ${className}`;

  // Only render the real <img> for avatars actually uploaded through our
  // Storage bucket. Third-party defaults (Google initials etc.) skip this
  // branch and fall through to the consistent fallback bubble below.
  if (isUploadedAvatar(avatarUrl)) {
    return (
      <img
        src={avatarUrl}
        alt={title}
        title={title}
        width={size}
        height={size}
        className={`${baseClass} object-cover`}
        // Bust the browser's stale image cache when the URL itself doesn't
        // change (e.g., same filename, new bytes). Supabase returns a fresh
        // ETag, but cached <img> often ignores it; leaving this off is fine
        // since we update the URL with a query string when re-uploading.
      />
    );
  }

  return (
    <div
      title={title}
      style={{
        width: size,
        height: size,
        backgroundColor: background,
        fontSize: Math.max(10, Math.floor(size * 0.42)),
      }}
      className={baseClass}
    >
      {initial}
    </div>
  );
}
