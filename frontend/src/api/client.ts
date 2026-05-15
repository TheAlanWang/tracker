import axios from "axios";

import { supabase } from "@/lib/supabase";

const baseURL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

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
      window.location.href = "/login";
    }
    return Promise.reject(error);
  },
);
