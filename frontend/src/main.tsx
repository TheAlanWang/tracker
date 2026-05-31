import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App.tsx";
// Actually load the UI font. Without this the `'Geist Variable'` family in
// index.css never resolves and the app falls back to the generic `sans-serif`
// (Helvetica/Arial on macOS).
import "@fontsource-variable/geist/index.css";
import "./index.css";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/lib/auth";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {/* ErrorBoundary outside QueryClientProvider so it catches errors in
        every part of the app (including QueryClient itself). Toaster
        stays inside the boundary so error toasts in the fallback work. */}
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <App />
          <Toaster />
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
