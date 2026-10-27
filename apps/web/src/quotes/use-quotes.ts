"use client";

// Quotes' reads and changes (step 3, P0): the lists, one quote, its money, its PDFs and its link. A change loads again
// the quote, the lists that show it, and the lead whose stage it may move.
import type { ListQuotesInput } from "@travel-crm/contracts/quotes";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { refusalOf } from "@/data/api-error";
import { useTRPC, useTRPCClient } from "@/data/trpc";
import { useRefreshWork } from "@/data/use-refresh-work";

export function useQuotes(input: ListQuotesInput) {
  const trpc = useTRPC();
  return useQuery(trpc.quotes.list.queryOptions(input));
}

export function useLeadQuotes(leadId: string) {
  const trpc = useTRPC();
  return useQuery(trpc.quotes.forLead.queryOptions({ leadId }));
}

export function useQuote(quoteId: string) {
  const trpc = useTRPC();
  return useQuery(trpc.quotes.get.queryOptions({ quoteId }));
}

export function useQuotePackages() {
  const trpc = useTRPC();
  return useQuery({ ...trpc.quotes.packages.queryOptions(), staleTime: 60_000 });
}

export function useQuoteSettings() {
  const trpc = useTRPC();
  return useQuery({ ...trpc.quotes.settings.queryOptions(), staleTime: 60_000 });
}

/** After any change to a quote: every quote list and query, and the leads (a quote moves its lead's stage). */
function useRefreshQuotes() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const refreshWork = useRefreshWork();
  return () =>
    Promise.all([queryClient.invalidateQueries({ queryKey: trpc.quotes.pathKey() }), refreshWork()]).then(
      () => undefined,
    );
}

export function useQuoteChanges() {
  const trpc = useTRPC();
  const refresh = useRefreshQuotes();
  const options = { onSuccess: refresh };
  return {
    create: useMutation(trpc.quotes.create.mutationOptions(options)),
    update: useMutation(trpc.quotes.update.mutationOptions(options)),
    setStatus: useMutation(trpc.quotes.setStatus.mutationOptions(options)),
    remove: useMutation(trpc.quotes.delete.mutationOptions(options)),
    share: useMutation(trpc.quotes.share.mutationOptions(options)),
    addInstallment: useMutation(trpc.quotes.addInstallment.mutationOptions(options)),
    removeInstallment: useMutation(trpc.quotes.removeInstallment.mutationOptions(options)),
    recordPayment: useMutation(trpc.quotes.recordPayment.mutationOptions(options)),
    voidPayment: useMutation(trpc.quotes.voidPayment.mutationOptions(options)),
    fromPackage: useMutation(trpc.quotes.fromPackage.mutationOptions(options)),
    duplicate: useMutation(trpc.quotes.duplicate.mutationOptions(options)),
    savePackage: useMutation(trpc.quotes.savePackage.mutationOptions(options)),
    deletePackage: useMutation(trpc.quotes.deletePackage.mutationOptions(options)),
  };
}

export function useSaveQuoteSettings() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.quotes.saveSettings.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.quotes.settings.pathKey() }),
    }),
  );
}

const pause = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

/**
 * Issues one of a quote's PDFs (the quotation, its invoice or a payment's receipt), waits for the worker to render it,
 * and opens it. The worker renders in a few seconds; the link is asked for again until it is ready.
 */
export function useOpenDocument(quoteId: string) {
  const client = useTRPCClient();
  const refresh = useRefreshQuotes();
  return useMutation({
    mutationFn: async (which: { kind: "quote" | "invoice" } | { kind: "receipt"; paymentId: string }) => {
      // Opened at once, inside the tap, so the browser does not block it as a pop-up; filled in when the PDF is ready.
      const tab = window.open("about:blank", "_blank");
      const issued =
        which.kind === "receipt"
          ? await client.quotes.issueReceipt.mutate({ paymentId: which.paymentId })
          : which.kind === "quote"
            ? await client.quotes.issuePdf.mutate({ quoteId })
            : await client.quotes.issueInvoice.mutate({ quoteId });
      for (let attempt = 0; ; attempt += 1) {
        try {
          const link = await client.quotes.documentLink.mutate({ quoteId, documentId: issued.documentId });
          if (tab === null) window.location.assign(link.url);
          else tab.location.href = link.url;
          return issued;
        } catch (error) {
          if (attempt >= 15 || refusalOf(error)?.reason !== "DOCUMENT_NOT_READY") {
            tab?.close();
            throw error;
          }
          await pause(2000);
        }
      }
    },
    onSettled: refresh,
  });
}
