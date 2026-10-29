"use client";

// Saving a chat's file under its own name: the api is asked for a download link (never the in-place one the chat shows it by)
// when the button is pressed, and storage sends the file as a download, so the chat stays open.
import { useTRPCClient } from "@/data/trpc";
import { useDownload } from "@/files/use-download";

export function useMessageDownload() {
  const client = useTRPCClient();
  return useDownload((messageId: string) => client.inbox.mediaUrl.query({ messageId, download: true }));
}
