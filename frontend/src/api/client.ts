import axios from "axios";

import { supabase } from "@/lib/supabase";

// Production builds must have VITE_API_URL set at build time — fall back to a
// local dev URL only when running `vite dev`. Failing loudly in prod avoids
// the silent footgun of a deployed frontend trying to call 127.0.0.1:8000.
const baseURL = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? "http://127.0.0.1:8000" : undefined);
if (!baseURL) {
  throw new Error(
    "VITE_API_URL is not set. Configure it in your deployment environment (e.g. Vercel project env vars).",
  );
}

export const apiClient = axios.create({
  baseURL,
  headers: { "Content-Type": "application/json" },
});

apiClient.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (token) {
    config.headers.set("Authorization", `Bearer ${token}`);
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401 && !error.config.__retry) {
      error.config.__retry = true;
      const { data, error: refreshErr } =
        await supabase.auth.refreshSession();
      if (!refreshErr && data.session) {
        return apiClient.request(error.config);
      }
      window.location.href = "/?login=open";
    }
    return Promise.reject(error);
  },
);
