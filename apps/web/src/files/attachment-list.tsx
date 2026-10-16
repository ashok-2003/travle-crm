"use client";

// A record's files as a list of items (DESIGN.md section 6): the name (wrapping, any script), then its kind, size and
// the day it was added in the organization's zone, and Download and Remove. A sensitive file is marked; to a role
// without documents:view_sensitive it is only a "Sensitive file", with nothing to do to it (spec 5).
import type { AttachmentSummary } from "@travel-crm/contracts/files";
import { DownloadIcon, FileIcon, LockIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Fragment, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";
import { formatDay } from "@/lib/format";
import { holds, useMe } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { kindOf } from "./attachment-file";
import { formatFileSize } from "./file-size";
import { useDownloadAttachment, useRemoveAttachment, type AttachmentRecord } from "./use-attachments";

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
  const remove = useRemoveAttachment(record, name, () => {
    setRemoving(false);
  });
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
        variant="outline"
        aria-label={t("removeName", { name })}
        disabled={!change.allowed}
        onClick={() => {
          setRemoving(true);
        }}
      >
        {t("remove")}
      </Button>
      {/* Its bytes stay in storage until the platform's purge, so it still counts toward the plan (ADR 0011). */}
      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title={t("removeTitle", { name })}
        description={t("removeDescription")}
        action={t("remove")}
        request={remove}
        onConfirm={() => {
          remove.mutate({ ...record, attachmentId: attachment.id });
        }}
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
    <Item size="sm" role="listitem">
      <ItemMedia variant="icon">
        <FileIcon aria-hidden="true" />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle>
          <span className="wrap-anywhere script-leading">{name}</span>
        </ItemTitle>
        <ItemDescription className="flex flex-wrap items-center gap-x-1">
          {t(`kinds.${kindOf(attachment.contentType)}`)} ·{" "}
          <span className="numbers">{formatFileSize(attachment.sizeBytes)}</span> · {t("added", { date: added })}
          {attachment.sensitive && (
            <>
              {" · "}
              <LockIcon aria-hidden="true" className="size-3.5" />
              {t("sensitive")}
            </>
          )}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        {hidden ? (
          <p className="text-label text-muted-foreground">{t("sensitiveHidden")}</p>
        ) : (
          <AttachmentActions record={record} attachment={attachment} name={name} />
        )}
      </ItemActions>
    </Item>
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
    <ItemGroup>
      {attachments.map((attachment, index) => (
        <Fragment key={attachment.id}>
          {index > 0 && <ItemSeparator />}
          <AttachmentRow record={record} attachment={attachment} />
        </Fragment>
      ))}
    </ItemGroup>
  );
}
