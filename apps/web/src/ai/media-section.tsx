"use client";

// The media the AI sends (the owner, 2026-10-29): photos, videos and PDFs (a brochure, a hotel's photos, an itinerary),
// each with when to send it in the agency's words. A file is chosen, named and described in one dialog, then goes
// straight to storage; each can be opened, changed, turned off or removed, and says how many chats it went to.
import { MAX_AI_MEDIA_BYTES, aiMediaContentTypes, type AiMediaItem } from "@travel-crm/contracts/ai";
import { FileTextIcon, ImageIcon, PencilIcon, Trash2Icon, UploadIcon, VideoIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { RefusalAlert } from "@/components/refusal-alert";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useTRPCClient } from "@/data/trpc";
import { uploadFile } from "@/files/upload";
import { useErrorMessage } from "@/lib/error-message";
import { openInNewTab } from "@/lib/open-in-new-tab";
import { useWriteAccess } from "@/subscription/write-access";
import { useAiMedia, useConfirmMedia, useDeleteMedia, useRequestMedia, useUpdateMedia } from "./use-ai";

function MediaIcon({ contentType }: { contentType: string }) {
  if (contentType.startsWith("image/")) return <ImageIcon aria-hidden="true" />;
  if (contentType.startsWith("video/")) return <VideoIcon aria-hidden="true" />;
  return <FileTextIcon aria-hidden="true" />;
}

/** Its title and when to send it: for a file about to be uploaded, or one already there. */
function MediaDialog({
  open,
  onOpenChange,
  file,
  editing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: File | null;
  editing: AiMediaItem | null;
}) {
  const t = useTranslations("ai.media");
  const { apiError } = useErrorMessage();
  const requestMedia = useRequestMedia();
  const confirmMedia = useConfirmMedia();
  const update = useUpdateMedia();
  const [title, setTitle] = useState(editing?.title ?? file?.name.replace(/\.[^.]+$/, "").slice(0, 120) ?? "");
  const [whenToSend, setWhenToSend] = useState(editing?.whenToSend ?? "");
  const [uploading, setUploading] = useState(false);
  const formId = useId();
  const ids = { title: useId(), when: useId() };
  const busy = uploading || update.isPending;

  const upload = async (chosen: File, contentType: (typeof aiMediaContentTypes)[number]) => {
    setUploading(true);
    try {
      const slot = await requestMedia.mutateAsync({
        title,
        whenToSend,
        fileName: chosen.name,
        contentType,
        sizeBytes: chosen.size,
      });
      await uploadFile(slot.upload, chosen);
      await confirmMedia.mutateAsync({ mediaId: slot.mediaId, attachmentId: slot.attachmentId });
      toast.success(t("uploaded"));
      onOpenChange(false);
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setUploading(false);
    }
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      busy={busy}
      title={editing === null ? t("addTitle") : t("editTitle")}
      description={editing === null ? (file?.name ?? "") : editing.fileName}
      footer={
        <Button type="submit" form={formId} disabled={busy || title.trim() === ""}>
          {busy && <Spinner aria-hidden="true" />}
          {editing === null ? t("uploadAction") : t("save")}
        </Button>
      }
    >
      <form
        id={formId}
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (editing !== null) {
            update.mutate(
              { mediaId: editing.id, title, whenToSend, enabled: editing.enabled },
              {
                onSuccess: () => {
                  toast.success(t("saved"));
                  onOpenChange(false);
                },
              },
            );
            return;
          }
          const contentType = aiMediaContentTypes.find((one) => one === file?.type);
          if (file !== null && contentType !== undefined) void upload(file, contentType);
        }}
      >
        <Field>
          <FieldLabel htmlFor={ids.title}>{t("titleLabel")}</FieldLabel>
          <Input
            id={ids.title}
            value={title}
            maxLength={120}
            placeholder={t("titlePlaceholder")}
            onChange={(event) => {
              setTitle(event.target.value);
            }}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={ids.when}>{t("whenLabel")}</FieldLabel>
          <Textarea
            id={ids.when}
            rows={3}
            value={whenToSend}
            maxLength={400}
            placeholder={t("whenPlaceholder")}
            onChange={(event) => {
              setWhenToSend(event.target.value);
            }}
          />
          <FieldDescription>{t("whenHint")}</FieldDescription>
        </Field>
        <RefusalAlert error={update.error} />
      </form>
    </ResponsiveDialog>
  );
}

function MediaRow({ item, disabled }: { item: AiMediaItem; disabled: boolean }) {
  const t = useTranslations("ai.media");
  const client = useTRPCClient();
  const { apiError } = useErrorMessage();
  const update = useUpdateMedia();
  const remove = useDeleteMedia();
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const open = () => {
    openInNewTab(() => client.ai.mediaLink.query({ mediaId: item.id })).catch((error: unknown) => {
      toast.error(apiError(error));
    });
  };
  return (
    <Item variant="muted">
      <ItemMedia variant="icon">
        <MediaIcon contentType={item.contentType} />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>
          <Button
            variant="link"
            className="h-auto p-0 text-left whitespace-normal"
            disabled={!item.ready}
            onClick={open}
          >
            {item.title}
          </Button>
          {!item.ready && <StatusBadge tone="attention">{t("uploading")}</StatusBadge>}
        </ItemTitle>
        <ItemDescription>
          {item.whenToSend === "" ? t("noWhen") : t("when", { when: item.whenToSend })}
          {" · "}
          {t("sent", { count: item.sent })}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <Switch
          checked={item.enabled}
          aria-label={t("use", { title: item.title })}
          disabled={disabled || update.isPending}
          onCheckedChange={(enabled) => {
            update.mutate({ mediaId: item.id, title: item.title, whenToSend: item.whenToSend, enabled });
          }}
        />
        <Button
          ref={opener}
          variant="ghost"
          size="icon"
          aria-label={t("edit", { title: item.title })}
          disabled={disabled}
          onClick={() => {
            setEditing(true);
          }}
        >
          <PencilIcon aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("remove", { title: item.title })}
          disabled={disabled}
          onClick={() => {
            setRemoving(true);
          }}
        >
          <Trash2Icon aria-hidden="true" />
        </Button>
      </ItemActions>
      {editing && <MediaDialog open={editing} onOpenChange={setEditing} file={null} editing={item} />}
      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title={t("removeTitle", { title: item.title })}
        description={t("removeDescription")}
        action={t("removeAction")}
        request={remove}
        returnFocusTo={opener}
        onConfirm={() => {
          remove.mutate(
            { mediaId: item.id },
            {
              onSuccess: () => {
                setRemoving(false);
              },
            },
          );
        }}
      />
    </Item>
  );
}

export function MediaSection() {
  const t = useTranslations("ai.media");
  const access = useWriteAccess("change");
  const media = useAiMedia();
  const [chosen, setChosen] = useState<File | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const items = media.data ?? [];

  const choose = (file: File) => {
    if (!aiMediaContentTypes.some((one) => one === file.type)) {
      toast.error(t("fileType"));
      return;
    }
    if (file.size > MAX_AI_MEDIA_BYTES) {
      toast.error(t("fileSize"));
      return;
    }
    setChosen(file);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t("title")}</h2>
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
        <CardAction>
          <input
            ref={picker}
            type="file"
            accept=".jpg,.jpeg,.png,.mp4,.pdf,image/jpeg,image/png,video/mp4,application/pdf"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file !== undefined) choose(file);
            }}
          />
          <Button disabled={!access.allowed} onClick={() => picker.current?.click()}>
            <UploadIcon aria-hidden="true" />
            {t("upload")}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {media.isError && <RefusalAlert error={media.error} />}
        {items.length === 0 ? (
          <p className="text-muted-foreground">{t("empty")}</p>
        ) : (
          <ItemGroup className="gap-2">
            {items.map((item) => (
              <MediaRow key={item.id} item={item} disabled={!access.allowed} />
            ))}
          </ItemGroup>
        )}
        <p className="text-caption text-muted-foreground">{t("hint")}</p>
      </CardContent>
      {chosen !== null && (
        <MediaDialog
          open
          onOpenChange={(open) => {
            if (!open) setChosen(null);
          }}
          file={chosen}
          editing={null}
        />
      )}
    </Card>
  );
}
