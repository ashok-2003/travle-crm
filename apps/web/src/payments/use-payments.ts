"use client";

// Payments to check: the list a page at a time, and a person's word on each (confirm, refuse, dismiss). A decision loads
// again this list, the bookings and quotes it changed, and Today (its count and tasks). Its toast says how the customer
// was told, and it and the focus (on the page's heading) live here in the mutation's options, not in a caller's mutate(),
// because the row is gone once it is decided.
import type { PaymentTold } from "@travel-crm/contracts/bookings";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useRefreshBookings } from "@/bookings/use-bookings";
import { useCursorPages } from "@/data/use-cursor-pages";
import { useTRPC, useTRPCClient } from "@/data/trpc";

export function usePaymentsToCheck() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  return useCursorPages({
    queryKey: trpc.paymentsToCheck.list.pathKey(),
    page: (cursor) => client.paymentsToCheck.list.query(cursor === null ? {} : { cursor }),
    items: (page) => page.items,
  });
}

/** A decided row is gone, and the button that opened its dialog with it: the focus goes to the page's heading. */
function focusPageHeading() {
  const heading = document.querySelector<HTMLElement>("h1");
  if (heading === null) return;
  heading.tabIndex = -1;
  heading.focus();
}

/** After any decision: this screen's queries, then everything a booking's change loads again; then the focus is kept. */
function useRefreshPayments() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const refreshBookings = useRefreshBookings();
  return async () => {
    await Promise.all([queryClient.invalidateQueries({ queryKey: trpc.paymentsToCheck.pathKey() }), refreshBookings()]);
    focusPageHeading();
  };
}

export function useConfirmPayment() {
  const trpc = useTRPC();
  const t = useTranslations("payments.told");
  const refresh = useRefreshPayments();
  return useMutation(
    trpc.paymentsToCheck.confirm.mutationOptions({
      onSuccess: async ({ told }: { told: PaymentTold }) => {
        await refresh();
        toast.success(t(told));
      },
    }),
  );
}

export function useRefusePayment() {
  const trpc = useTRPC();
  const t = useTranslations("payments.told");
  const refresh = useRefreshPayments();
  return useMutation(
    trpc.paymentsToCheck.refuse.mutationOptions({
      onSuccess: async ({ told }: { told: PaymentTold }) => {
        await refresh();
        toast.success(t(told));
      },
    }),
  );
}

export function useDismissProof() {
  const trpc = useTRPC();
  const t = useTranslations("payments");
  const refresh = useRefreshPayments();
  return useMutation(
    trpc.paymentsToCheck.dismissProof.mutationOptions({
      onSuccess: async () => {
        await refresh();
        toast.success(t("dismissed"));
      },
    }),
  );
}
