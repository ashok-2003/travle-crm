"use client";

// The lead export's calls for the shared export pieces (exports/use-export.ts): asking for the list as a file (with the
// filter it was asked with, none on the export's own page), the export's detail under the router's own key, and the
// file's link.
import type { LeadExportFilter } from "@travel-crm/contracts/crm";
import { useTRPC, useTRPCClient } from "@/data/trpc";
import type { ExportCalls } from "@/exports/use-export";

export function useLeadExportCalls(filter: LeadExportFilter | null): ExportCalls {
  const trpc = useTRPC();
  const client = useTRPCClient();
  return {
    start: (format) =>
      filter === null
        ? Promise.reject(new Error("This export was asked for already"))
        : client.leadExports.start.mutate({ filter, format }),
    detailOptions: (exportId) => ({
      queryKey: trpc.leadExports.get.queryKey({ exportId }),
      queryFn: () => client.leadExports.get.query({ exportId }),
    }),
    downloadLink: (exportId) => client.leadExports.downloadLink.mutate({ exportId }),
  };
}
