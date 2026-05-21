// Upload a pasted / dropped image to the task-images Storage bucket and
// return a `task-image:<path>` reference suitable for embedding in
// markdown. Rendering is handled by <TaskImage>, which swaps the
// reference for a short-lived signed URL via resolveTaskImageUrl.
//
// Storage layout: {workspace_id}/{user_id}/{ts}-{filename}. The bucket
// is private; RLS in 20260521000000_task_images_private.sql enforces
// that only workspace members can list / read / write, and that the
// second path segment matches auth.uid on insert.

import { supabase } from "@/lib/supabase";

const TASK_IMAGES_BUCKET = "task-images";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

export async function uploadTaskImage(
  file: File,
  workspaceId: string,
  userId: string,
): Promise<string> {
  if (!ALLOWED_MIME.has(file.type)) {
    throw new Error("Only PNG / JPEG / WebP / GIF images supported");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("Image must be under 5 MB");
  }
  const ext = file.name.split(".").pop() || "png";
  // Sanitize filename for the URL path while keeping it human-readable
  // for the markdown alt text. Timestamp prefix avoids collisions on
  // re-paste of "image.png" / "Screenshot.png".
  const safe = file.name.replace(/[^\w.-]+/g, "_").slice(0, 60);
  const path = `${workspaceId}/${userId}/${Date.now()}-${safe || `image.${ext}`}`;
  const { error: uploadErr } = await supabase.storage
    .from(TASK_IMAGES_BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type });
  if (uploadErr) throw uploadErr;
  // Bucket is private — no public URL. Store the path with a sentinel
  // scheme so <TaskImage> knows to resolve it via createSignedUrl.
  return `task-image:${path}`;
}
