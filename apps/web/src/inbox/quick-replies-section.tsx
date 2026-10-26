"use client";

// Quick replies and tags on /settings/whatsapp (sales inbox spec, section 5), for the Owner and Admins: the agency's saved
// answers (shortcut, title, words; Add, Edit, Delete), with a word on the "payment" one that the reply bar's ₹ uses, and
// the agency's tags for chats (Add, Delete; a deleted tag leaves every chat).
import type { QuickReply } from "@travel-crm/contracts/inbox";
import { MessageSquareTextIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useWriteAccess } from "@/subscription/write-access";
import { QuickReplyDialog } from "./quick-reply-dialog";
import { useDeleteTag, useQuickReplies, useSaveQuickReply, useTags } from "./use-inbox-tools";

function ReplyRow({ reply }: { reply: QuickReply }) {
  const t = useTranslations("inbox.quickReplies");
  const access = useWriteAccess("change");
  const { remove } = useSaveQuickReply();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const editButton = useRef<HTMLButtonElement>(null);
  const deleteButton = useRef<HTMLButtonElement>(null);
  return (
    <TableRow>
      <TableCell className="numbers">/{reply.shortcut}</TableCell>
      <TableCell>
        <p className="font-medium">{reply.title}</p>
        <p className="line-clamp-2 text-caption text-muted-foreground wrap-anywhere" dir="auto">
          {reply.body}
        </p>
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            ref={editButton}
            variant="outline"
            disabled={!access.allowed}
            aria-label={t("editNamed", { title: reply.title })}
            onClick={() => {
              setEditing(true);
            }}
          >
            {t("edit")}
          </Button>
          {editing && (
            <QuickReplyDialog
              existing={reply}
              held={{ open: editing, setOpen: setEditing }}
              returnFocusTo={editButton}
            />
          )}
          <Button
            ref={deleteButton}
            variant="outline"
            disabled={!access.allowed}
            aria-label={t("deleteNamed", { title: reply.title })}
            onClick={() => {
              setDeleting(true);
            }}
          >
            {t("delete")}
          </Button>
          <ConfirmDialog
            open={deleting}
            onOpenChange={setDeleting}
            title={t("deleteTitle", { title: reply.title })}
            description={t("deleteDescription")}
            action={t("delete")}
            request={remove}
            onConfirm={() => {
              remove.mutate(
                { quickReplyId: reply.id },
                {
                  onSuccess: () => {
                    setDeleting(false);
                  },
                },
              );
            }}
            returnFocusTo={deleteButton}
          />
        </div>
      </TableCell>
    </TableRow>
  );
}

export function QuickRepliesSection() {
  const t = useTranslations("inbox.quickReplies");
  const list = useQuickReplies();
  const body = () => {
    if (list.data === undefined) {
      return list.isError ? (
        <ErrorState
          message={t("loadFailed")}
          error={list.error}
          retryLabel={t("retry")}
          onRetry={() => void list.refetch()}
        />
      ) : (
        <LoadingRows shape="table" columns={3} label={t("loading")} />
      );
    }
    if (list.data.length === 0) return <EmptyState icon={MessageSquareTextIcon} message={t("empty")} />;
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("columns.shortcut")}</TableHead>
            <TableHead>{t("columns.reply")}</TableHead>
            <TableHead>
              <span className="sr-only">{t("columns.actions")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.data.map((reply) => (
            <ReplyRow key={reply.id} reply={reply} />
          ))}
        </TableBody>
      </Table>
    );
  };
  return (
    <section aria-labelledby="quick-replies-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="quick-replies-heading" className="text-section font-semibold">
          {t("title")}
        </h2>
        <QuickReplyDialog />
      </div>
      <p className="max-w-[65ch] text-muted-foreground">{t("intro")}</p>
      {body()}
    </section>
  );
}

function TagChip({ tag }: { tag: { id: string; name: string } }) {
  const t = useTranslations("inbox.tagsSettings");
  const access = useWriteAccess("change");
  const remove = useDeleteTag();
  const [deleting, setDeleting] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  return (
    <Badge variant="secondary" className="h-11 gap-1 pr-1 pl-3 text-label">
      {tag.name}
      <Button
        ref={button}
        variant="ghost"
        size="icon"
        aria-label={t("deleteNamed", { name: tag.name })}
        disabled={!access.allowed}
        onClick={() => {
          setDeleting(true);
        }}
      >
        <XIcon aria-hidden="true" />
      </Button>
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={t("deleteTitle", { name: tag.name })}
        description={t("deleteDescription")}
        action={t("delete")}
        request={remove}
        onConfirm={() => {
          remove.mutate(
            { tagId: tag.id },
            {
              onSuccess: () => {
                setDeleting(false);
              },
            },
          );
        }}
        returnFocusTo={button}
      />
    </Badge>
  );
}

export function TagsSection() {
  const t = useTranslations("inbox.tagsSettings");
  const tags = useTags();
  return (
    <section aria-labelledby="tags-heading" className="flex flex-col gap-4">
      <h2 id="tags-heading" className="text-section font-semibold">
        {t("title")}
      </h2>
      <p className="max-w-[65ch] text-muted-foreground">{t("intro")}</p>
      {tags.data === undefined ? (
        tags.isError ? (
          <ErrorState
            message={t("loadFailed")}
            error={tags.error}
            retryLabel={t("retry")}
            onRetry={() => void tags.refetch()}
          />
        ) : (
          <LoadingRows shape="twoLines" label={t("loading")} />
        )
      ) : tags.data.length === 0 ? (
        <p className="text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {tags.data.map((tag) => (
            <TagChip key={tag.id} tag={tag} />
          ))}
        </div>
      )}
    </section>
  );
}
