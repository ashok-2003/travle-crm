"use client";

// Downloading an issued document's PDF through its five-minute link (useDownload), which storage sends under the
// document's number.
import { useTRPCClient } from "@/data/trpc";
import { useDownload } from "@/files/use-download";

export function useDownloadPdf() {
  const client = useTRPCClient();
  return useDownload((documentId: string) => client.documents.downloadLink.mutate({ documentId }));
}
