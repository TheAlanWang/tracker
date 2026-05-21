// Resolves bucket-relative paths stored in markdown (`task-image:<path>`)
// into short-lived signed URLs that the browser can actually fetch.
//
// Markdown stores the relative path so the source survives signed-URL
// rotation: a paste from 6 months ago still resolves the next time anyone
// opens the task, the only thing that changes is the token in the URL.
//
// In-process cache keeps signed URLs around for slightly less than their
// real TTL so we never hand back a URL that's about to 401 mid-render.
// Inflight tracking dedupes concurrent calls for the same path (common
// when several <TaskImage> components mount simultaneously).

import { defaultUrlTransform } from "react-markdown";

import { supabase } from "@/lib/supabase";

const SIGNED_URL_TTL_SECONDS = 3600;
// 10-minute margin under the 1-hour Supabase TTL.
const CACHE_TTL_MS = 50 * 60 * 1000;

const cache = new Map<string, { url: string; expiresAt: number }>();
const inflight = new Map<string, Promise<string>>();

export async function resolveTaskImageUrl(path: string): Promise<string> {
  const cached = cache.get(path);
  if (cached && cached.expiresAt > Date.now()) return cached.url;
  const existing = inflight.get(path);
  if (existing) return existing;

  const promise = (async () => {
    const { data, error } = await supabase.storage
      .from("task-images")
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    if (error) throw error;
    cache.set(path, {
      url: data.signedUrl,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
    return data.signedUrl;
  })();

  inflight.set(path, promise);
  promise.finally(() => inflight.delete(path));
  return promise;
}

export function isTaskImageUrl(src: string | undefined | null): src is string {
  return typeof src === "string" && src.startsWith("task-image:");
}

export function taskImagePath(src: string): string {
  return src.slice("task-image:".length);
}

// react-markdown's default urlTransform sanitizes URLs by rejecting any
// scheme not on its safe-list (http, https, mailto, etc.), which strips
// our `task-image:` references and breaks the <img src>. Pass this to
// ReactMarkdown's `urlTransform` prop wherever <TaskImage> needs to
// receive raw `task-image:` srcs.
export function markdownUrlTransform(url: string): string {
  if (url.startsWith("task-image:")) return url;
  return defaultUrlTransform(url);
}
