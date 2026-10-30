"use client";

// The rooming list as files (release 7a): the PDF for a stay, issued as it stands now and opened in a new tab once the worker
// has rendered it (the tab is opened inside the tap, so the browser does not block it); and the CSV, built by the api and
// saved from the browser.
import { useMutation } from "@tanstack/react-query";
import { refusalOf } from "@/data/api-error";
import { useTRPCClient } from "@/data/trpc";
import { useRefreshDepartures } from "./use-departures";

/** Excel reads a CSV as UTF-8 (names in any script) only when it starts with this mark. */
const BYTE_ORDER_MARK = String.fromCodePoint(0xfeff);
const pause = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export function useRoomingPdf() {
  const client = useTRPCClient();
  const refresh = useRefreshDepartures();
  return useMutation({
    mutationFn: async (stayId: string) => {
      const tab = window.open("about:blank", "_blank");
      try {
        const { documentId } = await client.departures.rooming.issue.mutate({ stayId });
        for (let attempt = 0; ; attempt += 1) {
          try {
            const link = await client.departures.rooming.documentLink.mutate({ stayId, documentId });
            if (tab === null) window.location.assign(link.url);
            else tab.location.href = link.url;
            return documentId;
          } catch (error) {
            if (attempt >= 15 || refusalOf(error)?.reason !== "DOCUMENT_NOT_READY") throw error;
            await pause(2000);
          }
        }
      } catch (error) {
        tab?.close();
        throw error;
      }
    },
    onSettled: refresh,
  });
}

export function useRoomingCsv() {
  const client = useTRPCClient();
  return useMutation({
    mutationFn: async (stayId: string) => {
      const file = await client.departures.rooming.csv.query({ stayId });
      const url = URL.createObjectURL(new Blob([BYTE_ORDER_MARK, file.content], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = file.filename;
      link.click();
      URL.revokeObjectURL(url);
    },
  });
}
