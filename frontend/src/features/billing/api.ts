import { useMutation, useQuery } from "@tanstack/react-query";

import { apiClient } from "@/api/client";

// Both endpoints return a Stripe-hosted URL we redirect the browser to.
type BillingUrl = { url: string };

// Live subscription summary for the Billing page (renewal date / cancel state).
export type SubscriptionInfo = {
  status: string;
  current_period_end: number | null; // unix seconds
  cancel_at_period_end: boolean;
};

// Read the workspace's Stripe subscription on demand. Owner-only on the
// backend, so only enable it for an owner of a Stripe-backed Pro workspace.
export function useSubscription(workspaceId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["subscription", workspaceId],
    enabled: enabled && !!workspaceId,
    queryFn: async () => {
      const { data } = await apiClient.get<SubscriptionInfo>(
        "/billing/subscription",
        { params: { workspace_id: workspaceId } },
      );
      return data;
    },
  });
}

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
