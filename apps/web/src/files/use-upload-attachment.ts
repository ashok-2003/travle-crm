"use client";

// Uploading one file to a record (spec 9.2: file bytes never pass through the api): the api records it and signs an
// upload, the browser PUTs the file straight to storage with its progress (uploadFile), then the api confirms it
// arrived. It fails at once when offline rather than waiting at 0%, and can be stopped; the record's list is asked
// for again however it ends. A stopped upload leaves only a pending record, which nobody sees.
import type { AttachmentContentType } from "@travel-crm/contracts/files";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useTRPCClient } from "@/data/trpc";
import { uploadFile } from "./upload";
import { useRefreshAttachments, type AttachmentRecord } from "./use-attachments";

export interface UploadRequest {
  file: File;
  /** The type checkAttachmentFile found, which the upload is signed for. */
  contentType: AttachmentContentType;
  sensitive: boolean;
}

/** An upload the person stopped: not a failure to report. */
export function wasStopped(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function useUploadAttachment(record: AttachmentRecord) {
  const client = useTRPCClient();
  const refresh = useRefreshAttachments(record);
  const t = useTranslations("business.attachments");
  const [progress, setProgress] = useState(0);
  const stopper = useRef<AbortController | null>(null);
  const upload = useMutation({
    networkMode: "always",
    mutationFn: async ({ file, contentType, sensitive }: UploadRequest) => {
      const controller = new AbortController();
      stopper.current = controller;
      setProgress(0);
      const { attachment, upload: signed } = await client.attachments.requestUpload.mutate({
        ...record,
        fileName: file.name,
        contentType,
        sizeBytes: file.size,
        sensitive,
      });
      await uploadFile(signed, file, { onProgress: setProgress, signal: controller.signal });
      return client.attachments.confirmUpload.mutate({ ...record, attachmentId: attachment.id });
    },
    onSuccess: (_attachment, { file }) => {
      toast.success(t("uploaded", { name: file.name }));
    },
    onSettled: refresh,
  });
  return {
    upload,
    /** How much of the file storage has, from 0 to 1. */
    progress,
    stop: () => {
      stopper.current?.abort();
    },
  };
}
