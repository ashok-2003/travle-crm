"use client";

// An export as its dialog and its page follow it (spec 3.3, B41, B42): asking for it, its detail asked for again every
// 2 seconds while the worker makes the file, and its download through a short-lived link (useDownload). Each kind
// passes its own router's calls; `detailOptions` is `{ queryKey: trpc.<kind>.get.queryKey({ exportId }), queryFn: () =>
// client.<kind>.get.query({ exportId }) }`, since tRPC's own queryOptions carry its error type, not TanStack's.
import { useMutation, useQuery, type UseQueryOptions } from "@tanstack/react-query";
import type { ExportDetail, ExportFormat } from "@travel-crm/contracts/exports";
import type { DownloadLinkOutput } from "@travel-crm/contracts/files";
import { useState } from "react";
import { useDownload } from "@/files/use-download";

export interface ExportCalls {
  start: (format: ExportFormat) => Promise<{ exportId: string }>;
  detailOptions: (exportId: string) => UseQueryOptions<ExportDetail>;
  downloadLink: (exportId: string) => Promise<DownloadLinkOutput>;
}

/** The export a dialog asked for, or the one a page shows (`shown`). */
export function useExport(calls: ExportCalls, shown: string | null = null) {
  const [asked, setAsked] = useState<string | null>(null);
  const exportId = shown ?? asked;
  const detail = useQuery({
    ...calls.detailOptions(exportId ?? ""),
    enabled: exportId !== null,
    refetchInterval: (query) => (query.state.data?.status === "making" ? 2000 : false),
  });
  const start = useMutation({
    mutationFn: (format: ExportFormat) => calls.start(format),
    onSuccess: (started) => {
      setAsked(started.exportId);
    },
  });
  const download = useDownload((id: string) => calls.downloadLink(id));
  /** Back to choosing, for another export. */
  const reset = () => {
    setAsked(null);
    start.reset();
  };
  return { exportId, detail, start, download, reset };
}
