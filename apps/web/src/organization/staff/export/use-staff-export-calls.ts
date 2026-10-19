"use client";

// The staff export's calls, in the shape the shared export pieces take (exports/use-export.ts): asking for the file,
// following it, and its download link. The detail's options are written out, since tRPC's own carry its error type.
import type { ExportCalls } from "@/exports/use-export";
import { useTRPC, useTRPCClient } from "@/data/trpc";

export function useStaffExportCalls(): ExportCalls {
  const trpc = useTRPC();
  const client = useTRPCClient();
  return {
    start: (format) => client.staffExports.start.mutate({ format }),
    detailOptions: (exportId) => ({
      queryKey: trpc.staffExports.get.queryKey({ exportId }),
      queryFn: () => client.staffExports.get.query({ exportId }),
    }),
    downloadLink: (exportId) => client.staffExports.downloadLink.mutate({ exportId }),
  };
}
