"use client";

// A record's files as a divided list (DESIGN.md section 6): the name (wrapping, any script), then its kind, size and
// the day it was added in the organization's zone, and Download and Remove. A sensitive file is marked; to a role
// without documents:view_sensitive it is only a "Sensitive file", with nothing to do to it (spec 5).
import type { AttachmentSummary } from "@travel-crm/contracts/files";
import { DownloadIcon, FileIcon, LockIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { formatDay } from "@/lib/format";
import { holds, useMe } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { kindOf } from "./attachment-file";
import { formatFileSize } from "./file-size";
import { RemoveAttachmentDialog } from "./remove-attachment-dialog";
import { useDownloadAttachment, type AttachmentRecord } from "./use-attachments";

function AttachmentActions({
  record,
  attachment,
  name,
}: {
  record: AttachmentRecord;
  attachment: AttachmentSummary;
  name: string;
}) {
  const t = useTranslations("business.attachments");
  const change = useWriteAccess("change");
  const take = useWriteAccess("export");
  const download = useDownloadAttachment();
  const [removing, setRemoving] = useState(false);
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        aria-label={t("downloadName", { name })}
        disabled={!take.allowed || download.isPending}
        onClick={() => {
          download.mutate({ ...record, attachmentId: attachment.id });
        }}
      >
        <DownloadIcon aria-hidden="true" />
        {t("download")}
      </Button>
      <Button
        variant="destructive"
        aria-label={t("removeName", { name })}
        disabled={!change.allowed}
        onClick={() => {
          setRemoving(true);
        }}
      >
        {t("remove")}
      </Button>
      <RemoveAttachmentDialog
        record={record}
        attachmentId={attachment.id}
        name={name}
        open={removing}
        onOpenChange={setRemoving}
      />
    </div>
  );
}

function AttachmentRow({ record, attachment }: { record: AttachmentRecord; attachment: AttachmentSummary }) {
  const t = useTranslations("business.attachments");
  const me = useMe();
  // The api already hides the name; the screen says it in its own words, and offers nothing it would refuse.
  const hidden = attachment.sensitive && !holds(me, "documents:view_sensitive");
  const name = hidden ? t("sensitiveFile") : attachment.fileName;
  const added = formatDay(new Date(attachment.createdAt), { timeZone: me.organization.timeZone });
  return (
    <li className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <FileIcon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <div className="flex min-w-0 flex-col gap-1">
          <span className="font-medium break-words script-leading">{name}</span>
          <p className="flex flex-wrap items-center gap-x-1 text-label text-muted-foreground">
            {t(`kinds.${kindOf(attachment.contentType)}`)} ·{" "}
            <span className="numbers">{formatFileSize(attachment.sizeBytes)}</span> · {t("added", { date: added })}
            {attachment.sensitive && (
              <>
                {" · "}
                <LockIcon aria-hidden="true" className="size-3.5" />
                {t("sensitive")}
              </>
            )}
          </p>
        </div>
      </div>
      {hidden ? (
        <p className="text-label text-muted-foreground">{t("sensitiveHidden")}</p>
      ) : (
        <AttachmentActions record={record} attachment={attachment} name={name} />
      )}
    </li>
  );
}

export function AttachmentList({
  record,
  attachments,
}: {
  record: AttachmentRecord;
  attachments: AttachmentSummary[];
}) {
  return (
    <ul className="divide-y rounded-lg border">
      {attachments.map((attachment) => (
        <AttachmentRow key={attachment.id} record={record} attachment={attachment} />
      ))}
    </ul>
  );
}
