"use client";

// A record's files, for any screen that keeps files on its record (spec 9.2): a way to add one, then the list, with
// honest loading, empty and error states. The api decides who may use the record's files; this shows what it says.
import { FolderIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { AttachmentList } from "./attachment-list";
import { UploadControl } from "./upload-control";
import { useAttachments, type AttachmentRecord } from "./use-attachments";

export function AttachmentsPanel({ record, emptyMessage }: { record: AttachmentRecord; emptyMessage: string }) {
  const t = useTranslations("business.attachments");
  const tCommon = useTranslations("common");
  // Always asked again when the screen opens: the copy restored from IndexedDB can predate a file just added.
  const files = useAttachments(record);

  const body = () => {
    if (files.data) {
      return files.data.length > 0 ? (
        <AttachmentList record={record} attachments={files.data} />
      ) : (
        <EmptyState icon={FolderIcon} message={emptyMessage} />
      );
    }
    if (files.isError) {
      return (
        <ErrorState message={t("loadFailed")} retryLabel={tCommon("tryAgain")} onRetry={() => void files.refetch()} />
      );
    }
    return <LoadingRows rows={3} shape="twoLines" />;
  };

  return (
    <div className="flex flex-col gap-4">
      <UploadControl record={record} />
      {body()}
    </div>
  );
}
