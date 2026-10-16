"use client";

// A record's files and what can be done to one: list them, download one by a short-lived link (useDownload), remove
// one. Toasts, and closing the dialog that asked to remove a file, live in the hooks' mutation options, not in callers'
// mutate() options, so they don't depend on the calling component staying mounted. A refusal to remove shows in that
// dialog.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useTRPC, useTRPCClient } from "@/data/trpc";
import { useDownload } from "./use-download";

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
  const client = useTRPCClient();
  return useDownload((file: AttachmentRecord & { attachmentId: string }) =>
    client.attachments.downloadLink.mutate(file),
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
