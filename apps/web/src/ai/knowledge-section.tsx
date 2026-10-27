"use client";

// What the AI agent knows (the AI sales agent's settings): the agency's packages, prices, inclusions and policies, typed
// in or read from a PDF or text file (uploaded straight to storage; the worker reads its words, and the list looks again
// until it has). Each piece can be turned off, opened to edit, or removed. The agency's trips and quote packages are
// known too, without being added here.
import { MAX_AI_KNOWLEDGE_BYTES, aiKnowledgeContentTypes, type AiKnowledgeItem } from "@travel-crm/contracts/ai";
import { FileTextIcon, PlusIcon, Trash2Icon, UploadIcon } from "lucide-react";
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
import { uploadFile } from "@/files/upload";
import { useErrorMessage } from "@/lib/error-message";
import { useWriteAccess } from "@/subscription/write-access";
import {
  useAddKnowledge,
  useAiKnowledge,
  useConfirmDocument,
  useDeleteKnowledge,
  useRequestDocument,
  useUpdateKnowledge,
} from "./use-ai";

const statusTone = { ready: "good", reading: "attention", failed: "bad" } as const;

/** Adds a piece of text, or changes one (its words, for a typed one; its title, for a document). */
function KnowledgeDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: AiKnowledgeItem | null;
}) {
  const t = useTranslations("ai.knowledge");
  const add = useAddKnowledge();
  const update = useUpdateKnowledge();
  const [title, setTitle] = useState(editing?.title ?? "");
  const [body, setBody] = useState(editing?.body ?? "");
  const formId = useId();
  const ids = { title: useId(), body: useId() };
  const busy = add.isPending || update.isPending;
  const done = () => {
    toast.success(t("saved"));
    onOpenChange(false);
  };
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      busy={busy}
      title={editing === null ? t("addTitle") : t("editTitle")}
      description={t("dialogDescription")}
      footer={
        <Button type="submit" form={formId} disabled={busy || title.trim() === "" || body.trim() === ""}>
          {busy && <Spinner aria-hidden="true" />}
          {t("save")}
        </Button>
      }
    >
      <form
        id={formId}
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (editing === null) add.mutate({ title, body }, { onSuccess: done });
          else update.mutate({ knowledgeId: editing.id, title, body, enabled: editing.enabled }, { onSuccess: done });
        }}
      >
        <Field>
          <FieldLabel htmlFor={ids.title}>{t("titleLabel")}</FieldLabel>
          <Input
            id={ids.title}
            value={title}
            maxLength={120}
            onChange={(event) => {
              setTitle(event.target.value);
            }}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={ids.body}>{t("bodyLabel")}</FieldLabel>
          <Textarea
            id={ids.body}
            rows={12}
            value={body}
            maxLength={60_000}
            placeholder={t("bodyPlaceholder")}
            onChange={(event) => {
              setBody(event.target.value);
            }}
          />
          <FieldDescription>{t("bodyHint")}</FieldDescription>
        </Field>
        <RefusalAlert error={add.error ?? update.error} />
      </form>
    </ResponsiveDialog>
  );
}

function KnowledgeRow({ item, disabled }: { item: AiKnowledgeItem; disabled: boolean }) {
  const t = useTranslations("ai.knowledge");
  const update = useUpdateKnowledge();
  const remove = useDeleteKnowledge();
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  return (
    <Item variant="muted">
      <ItemMedia variant="icon">
        <FileTextIcon aria-hidden="true" />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>
          <Button
            ref={opener}
            variant="link"
            className="h-auto p-0 text-left whitespace-normal"
            disabled={disabled}
            onClick={() => {
              setEditing(true);
            }}
          >
            {item.title}
          </Button>
          {item.status !== "ready" && (
            <StatusBadge tone={statusTone[item.status]}>{t(`status.${item.status}`)}</StatusBadge>
          )}
        </ItemTitle>
        <ItemDescription>
          {item.kind === "file" ? (item.fileName ?? t("document")) : t("characters", { count: item.body.length })}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <Switch
          checked={item.enabled}
          aria-label={t("use", { title: item.title })}
          disabled={disabled || update.isPending}
          onCheckedChange={(enabled) => {
            update.mutate({ knowledgeId: item.id, title: item.title, body: item.body, enabled });
          }}
        />
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
      {editing && <KnowledgeDialog open={editing} onOpenChange={setEditing} editing={item} />}
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
            { knowledgeId: item.id },
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

export function KnowledgeSection() {
  const t = useTranslations("ai.knowledge");
  const { apiError } = useErrorMessage();
  const access = useWriteAccess("change");
  const knowledge = useAiKnowledge();
  const requestDocument = useRequestDocument();
  const confirmDocument = useConfirmDocument();
  const [adding, setAdding] = useState(false);
  const [uploading, setUploading] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const disabled = !access.allowed || uploading;

  const upload = async (file: File) => {
    const contentType = file.type === "" && file.name.endsWith(".txt") ? "text/plain" : file.type;
    const kind = aiKnowledgeContentTypes.find((one) => one === contentType);
    if (kind === undefined) {
      toast.error(t("fileType"));
      return;
    }
    if (file.size > MAX_AI_KNOWLEDGE_BYTES) {
      toast.error(t("fileSize"));
      return;
    }
    setUploading(true);
    try {
      const slot = await requestDocument.mutateAsync({
        title: file.name.replace(/\.[^.]+$/, "").slice(0, 120) || t("document"),
        fileName: file.name,
        contentType: kind,
        sizeBytes: file.size,
      });
      await uploadFile(slot.upload, file);
      await confirmDocument.mutateAsync({ knowledgeId: slot.knowledgeId, attachmentId: slot.attachmentId });
      toast.success(t("uploaded"));
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setUploading(false);
    }
  };

  const items = knowledge.data ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t("title")}</h2>
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
        <CardAction className="flex flex-wrap gap-2">
          <input
            ref={picker}
            type="file"
            accept=".pdf,.txt,application/pdf,text/plain"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file !== undefined) void upload(file);
            }}
          />
          <Button variant="outline" disabled={disabled} onClick={() => picker.current?.click()}>
            {uploading ? <Spinner aria-hidden="true" /> : <UploadIcon aria-hidden="true" />}
            {uploading ? t("uploading") : t("upload")}
          </Button>
          <Button
            disabled={disabled}
            onClick={() => {
              setAdding(true);
            }}
          >
            <PlusIcon aria-hidden="true" />
            {t("add")}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {knowledge.isError && <RefusalAlert error={knowledge.error} />}
        {items.length === 0 ? (
          <p className="text-muted-foreground">{t("empty")}</p>
        ) : (
          <ItemGroup className="gap-2">
            {items.map((item) => (
              <KnowledgeRow key={item.id} item={item} disabled={!access.allowed} />
            ))}
          </ItemGroup>
        )}
        <p className="text-caption text-muted-foreground">{t("alsoKnown")}</p>
      </CardContent>
      {adding && <KnowledgeDialog open={adding} onOpenChange={setAdding} editing={null} />}
    </Card>
  );
}
