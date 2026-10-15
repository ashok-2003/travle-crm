"use client";

// Downloading an issued document's PDF: a five-minute link from the api, opened at once, so it never sits in the cache
// or the saved copy. Storage sends the file as a download under the document's number; the page stays as it is.
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTRPCClient } from "@/data/trpc";
import { useErrorMessage } from "@/lib/error-message";
import { loadPage } from "@/lib/navigate";

export function useDownloadPdf() {
  const client = useTRPCClient();
  const { apiError } = useErrorMessage();
  return useMutation({
    mutationFn: (documentId: string) => client.documents.downloadLink.query({ documentId }),
    onSuccess: (link) => {
      loadPage(link.url);
    },
    onError: (error) => {
      toast.error(apiError(error));
    },
  });
}
