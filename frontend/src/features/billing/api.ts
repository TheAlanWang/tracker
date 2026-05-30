import { useMutation } from "@tanstack/react-query";

import { apiClient } from "@/api/client";

// Both endpoints return a Stripe-hosted URL we redirect the browser to.
type BillingUrl = { url: string };

// Upgrade to Pro: create a Checkout session and send the browser to Stripe.
// On return, Stripe redirects to /w/:slug/billing?checkout=success|cancelled
// (built server-side from the workspace slug + FRONTEND_URL).
export function useCreateCheckout() {
  return useMutation({
    mutationFn: async (workspaceId: string) => {
      const { data } = await apiClient.post<BillingUrl>("/billing/checkout", {
        workspace_id: workspaceId,
      });
      return data.url;
    },
    onSuccess: (url) => {
      window.location.href = url;
    },
  });
}

// Manage an existing subscription (update card / cancel) via the Stripe
// Billing Portal.
export function useBillingPortal() {
  return useMutation({
    mutationFn: async (workspaceId: string) => {
      const { data } = await apiClient.post<BillingUrl>("/billing/portal", {
        workspace_id: workspaceId,
      });
      return data.url;
    },
    onSuccess: (url) => {
      window.location.href = url;
    },
  });
}
