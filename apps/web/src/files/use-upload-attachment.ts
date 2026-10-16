"use client";

// Uploading one file to a record (useSignedUpload): the api records it with whether it is sensitive and signs the
// upload, storage takes the file, and the api confirms it. The record's list is asked for again however it ends.
import type { AttachmentContentType } from "@travel-crm/contracts/files";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useTRPCClient } from "@/data/trpc";
import { useRefreshAttachments, type AttachmentRecord } from "./use-attachments";
import { useSignedUpload } from "./use-signed-upload";

export interface UploadRequest {
  file: File;
  /** The type checkAttachmentFile found, which the upload is signed for. */
  contentType: AttachmentContentType;
  sensitive: boolean;
}

export function useUploadAttachment(record: AttachmentRecord) {
  const client = useTRPCClient();
  const refresh = useRefreshAttachments(record);
  const t = useTranslations("business.attachments");
  return useSignedUpload({
    requestUpload: async ({ file, contentType, sensitive }: UploadRequest) => {
      const { attachment, upload } = await client.attachments.requestUpload.mutate({
        ...record,
        fileName: file.name,
        contentType,
        sizeBytes: file.size,
        sensitive,
      });
      return { attachmentId: attachment.id, upload };
    },
    confirmUpload: (attachmentId) => client.attachments.confirmUpload.mutate({ ...record, attachmentId }),
    onSuccess: (_attachment, { file }) => {
      toast.success(t("uploaded", { name: file.name }));
    },
    onSettled: refresh,
  });
}
