"use client";

// The invoices screens' calls: the billing details, the invoice list a page at a time, and the changes (making,
// cancelling, saving the details), each refreshing what shows it from the hook itself so it doesn't depend on the dialog
// that asked still being open. Download and Copy read one invoice and use it at once.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCursorPages } from "@/data/use-cursor-pages";
import { useConsoleTRPC, useConsoleTRPCClient } from "../data/console-trpc";

const INVOICES_PER_PAGE = 25;

export function useBillingDetails() {
  const trpc = useConsoleTRPC();
  return useQuery(trpc.invoices.billingDetails.queryOptions());
}

export function useInvoices() {
  const trpc = useConsoleTRPC();
  const client = useConsoleTRPCClient();
  return useCursorPages({
    queryKey: [...trpc.invoices.list.pathKey(), { limit: INVOICES_PER_PAGE }],
    page: (cursor) =>
      client.invoices.list.query({ limit: INVOICES_PER_PAGE, ...(cursor === null ? {} : { before: cursor }) }),
    items: (page) => page.invoices,
  });
}

function useRefreshInvoices() {
  const trpc = useConsoleTRPC();
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: trpc.invoices.list.pathKey() });
}

/** `onMade` runs in the mutation's own options, so the dialog closes whether or not the form is still on screen. */
export function useCreateInvoice(onMade: (number: string) => void) {
  const trpc = useConsoleTRPC();
  const refresh = useRefreshInvoices();
  return useMutation(
    trpc.invoices.create.mutationOptions({
      onSuccess: (invoice) => {
        onMade(invoice.number);
      },
      onSettled: refresh,
    }),
  );
}

export function useCancelInvoice(onCancelled: (number: string) => void) {
  const trpc = useConsoleTRPC();
  const refresh = useRefreshInvoices();
  return useMutation(
    trpc.invoices.cancel.mutationOptions({
      onSuccess: (invoice) => {
        onCancelled(invoice.number);
      },
      onSettled: refresh,
    }),
  );
}

export function useSetBillingDetails(onSaved: () => void) {
  const trpc = useConsoleTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.invoices.setBillingDetails.mutationOptions({
      onSuccess: onSaved,
      onSettled: () => queryClient.invalidateQueries({ queryKey: trpc.invoices.billingDetails.pathKey() }),
    }),
  );
}

/**
 * Opens an invoice's stored PDF by the api's short-lived link, in this tab (the PDF opens or downloads in place): a
 * new tab opened after the request has waited is taken for a pop-up and blocked.
 */
export function useDownloadInvoice() {
  const client = useConsoleTRPCClient();
  return useMutation({
    mutationFn: (invoiceId: string) => client.invoices.downloadLink.query({ invoiceId }),
    onSuccess: ({ url }) => {
      window.location.assign(url);
    },
  });
}

/** One invoice in full, for a copy to start from. */
export function useReadInvoice() {
  const client = useConsoleTRPCClient();
  return useMutation({ mutationFn: (invoiceId: string) => client.invoices.get.query({ invoiceId }) });
}
