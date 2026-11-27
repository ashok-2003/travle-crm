"use client";

// The quotes export's calls for the shared export pieces (exports/use-export.ts): asking for the list as a file (with
// the filter it was asked with, none on the export's own page), the export's detail under the router's own key, and the
// file's link.
import type { QuoteExportFilter } from "@travel-crm/contracts/quotes";
import { useTRPC, useTRPCClient } from "@/data/trpc";
import type { ExportCalls } from "@/exports/use-export";

export function useQuoteExportCalls(filter: QuoteExportFilter | null): ExportCalls {
  const trpc = useTRPC();
  const client = useTRPCClient();
  return {
    start: (format) =>
      filter === null
        ? Promise.reject(new Error("This export was asked for already"))
        : client.quoteExports.start.mutate({ filter, format }),
    detailOptions: (exportId) => ({
      queryKey: trpc.quoteExports.get.queryKey({ exportId }),
      queryFn: () => client.quoteExports.get.query({ exportId }),
    }),
    downloadLink: (exportId) => client.quoteExports.downloadLink.mutate({ exportId }),
  };
}
