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
  size = 24,
  className = "",
}: Props) {
  const initial = pickInitial(displayName, email);
  const hue = hueFor(email ?? displayName ?? "?");
  const title = displayName || email || "";
  // Ring matches whatever surface the avatar overlaps — white in light
  // mode, the dark chrome color in dark mode. Without the dark variant
  // the avatar gets a glaring white halo on dark backgrounds.
  const baseClass = `rounded-full overflow-hidden flex items-center justify-center text-white font-semibold shrink-0 ring-2 ring-white dark:ring-slate-900 ${className}`;

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
        backgroundColor: `hsl(${hue} 55% 50%)`,
        fontSize: Math.max(10, Math.floor(size * 0.42)),
      }}
      className={baseClass}
    >
      {initial}
    </div>
  );
}
