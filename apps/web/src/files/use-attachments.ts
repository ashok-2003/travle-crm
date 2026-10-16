"use client";

// A record's files and what can be done to one: list them, download one by a short-lived link, remove one. A link is
// asked for when it is needed (a mutation, so none is kept on the device) and fails at once when offline rather than
// opening the download whenever the connection comes back. Toasts, and closing the dialog that asked to remove a file,
// live in the hooks' mutation options, not in callers' mutate() options, so they don't depend on the calling component
// staying mounted. A refusal to remove shows in that dialog.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useTRPC } from "@/data/trpc";
import { useErrorMessage } from "@/lib/error-message";
import { startDownload } from "./start-download";

/** The record a file belongs to: every call names it, so the api can check who may use that record's files. */
export interface AttachmentRecord {
  recordType: string;
  recordId: string;
}

export function useAttachments(record: AttachmentRecord) {
  const trpc = useTRPC();
  return useQuery(trpc.attachments.list.queryOptions(record));
}

export function useRefreshAttachments(record: AttachmentRecord) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: trpc.attachments.list.queryKey(record) });
}

export function useDownloadAttachment() {
  const trpc = useTRPC();
  const { apiError } = useErrorMessage();
  return useMutation(
    trpc.attachments.downloadLink.mutationOptions({
      networkMode: "always",
      onSuccess: (link) => {
        startDownload(link.url);
      },
      onError: (error) => {
        toast.error(apiError(error), { duration: Infinity });
      },
    }),
  );
}

/** Removing a file; `onRemoved` closes the dialog that asked. */
export function useRemoveAttachment(record: AttachmentRecord, name: string, onRemoved: () => void) {
  const trpc = useTRPC();
  const refresh = useRefreshAttachments(record);
  const t = useTranslations("business.attachments");
  return useMutation(
    trpc.attachments.remove.mutationOptions({
      onSuccess: () => {
        toast.success(t("removed", { name }));
        onRemoved();
      },
      onSettled: refresh,
    }),
  );
}
