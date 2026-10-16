"use client";

// Downloading through a short-lived link, for the papers and the issued documents' PDFs alike: the api is asked for
// the link when the button is pressed (a mutation, so no link is cached or saved on the device), then the browser goes
// to it. Storage sends the file as a download under its own name (Content-Disposition: attachment, ADR 0011), so this
// page stays open. Offline it fails at once, rather than opening the download whenever the connection comes back,
// perhaps on another screen. A failure's sentence stays until dismissed. The toast lives here, not in a caller's
// mutate() options, so it doesn't depend on the calling component staying mounted.
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useErrorMessage } from "@/lib/error-message";
import { loadPage } from "@/lib/navigate";

export function useDownload<Input>(linkFor: (input: Input) => Promise<{ url: string }>) {
  const { apiError } = useErrorMessage();
  return useMutation({
    networkMode: "always",
    mutationFn: (input: Input) => linkFor(input),
    onSuccess: (link) => {
      loadPage(link.url);
    },
    onError: (error) => {
      toast.error(apiError(error), { duration: Infinity });
    },
  });
}
