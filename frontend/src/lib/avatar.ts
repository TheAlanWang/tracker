// Distinguishes "real uploaded avatar" from third-party default avatars.
//
// Google OAuth populates `user_metadata.avatar_url` with auto-generated
// initials-style images from `lh3.googleusercontent.com/a/...` whether the
// user uploaded a photo to Google or not. Those default images visually
// duplicate our own fallback initials bubble (same colored-letter idea),
// and trick UI that branches on "has avatar" into showing Change/Remove
// affordances for an avatar the user never set.
//
// Treat ONLY URLs from this project's Supabase Storage `avatars` bucket as
// real uploads. Everything else (Google default, GitHub default, empty,
// null) falls through to the consistent fallback bubble.
const SUPABASE_AVATAR_MARKER = "/storage/v1/object/public/avatars/";

// Typed as a type guard so callers' `if (isUploadedAvatar(url)) { ... }`
// narrows `url` to `string` inside the branch (no `!` assertion needed).
export function isUploadedAvatar(
  url: string | null | undefined,
): url is string {
  if (!url) return false;
  return url.includes(SUPABASE_AVATAR_MARKER);
}
