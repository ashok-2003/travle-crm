"use client";

// Uploading one file to a record (spec 9.2: file bytes never pass through the api): the api records it and signs an
// upload, the browser PUTs the file straight to storage with its progress (uploadFile), then the api confirms it
// arrived. It fails at once when offline rather than waiting at 0%, and can be stopped; the record's list is asked
// for again however it ends. Trying a failed upload again picks up where it stopped: once storage has the file only
// the confirmation is sent again (it is harmless to repeat), and before that the same signed upload while it lasts,
// so a retry never leaves another record behind. A stopped upload leaves only a pending record, which nobody sees.
import type { AttachmentContentType, PresignedUploadOutput } from "@travel-crm/contracts/files";
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

/** How far an upload got: the record the api made for it, the upload it signed, and whether storage has the file. */
interface Progressed {
  request: UploadRequest;
  attachmentId: string;
  signed: PresignedUploadOutput;
  arrived: boolean;
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
  /** The last upload that didn't finish, for trying the same request again. */
  const unfinished = useRef<Progressed | null>(null);
  const upload = useMutation({
    networkMode: "always",
    mutationFn: async (request: UploadRequest) => {
      const controller = new AbortController();
      stopper.current = controller;
      const last = unfinished.current;
      let sent =
        last?.request === request && (last.arrived || Date.parse(last.signed.expiresAt) > Date.now()) ? last : null;
      if (!sent) {
        const { attachment, upload: signed } = await client.attachments.requestUpload.mutate({
          ...record,
          fileName: request.file.name,
          contentType: request.contentType,
          sizeBytes: request.file.size,
          sensitive: request.sensitive,
        });
        sent = { request, attachmentId: attachment.id, signed, arrived: false };
        unfinished.current = sent;
      }
      if (!sent.arrived) {
        setProgress(0);
        await uploadFile(sent.signed, request.file, { onProgress: setProgress, signal: controller.signal });
        sent.arrived = true;
      }
      return client.attachments.confirmUpload.mutate({ ...record, attachmentId: sent.attachmentId });
    },
    onSuccess: (_attachment, { file }) => {
      unfinished.current = null;
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
