"use client";

// A new broadcast (sales inbox spec 6): choose an approved template, the tags and the template's blanks, check who it reaches
// (who is left out, and why, and what is left of the month's allowance), then confirm. The browser's request id is made once
// per opening, so a confirm sent twice is one broadcast. Nothing is sent before the confirm.
import type { BroadcastPreview, TemplateSummary } from "@travel-crm/contracts/inbox";
import { MAX_BROADCAST_TAGS } from "@travel-crm/contracts/inbox";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { toast } from "sonner";
import { RefusalAlert } from "@/components/refusal-alert";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import type { ReturnFocusTo } from "@/components/return-focus";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { broadcastRoute } from "@/lib/routes";
import { useTags } from "../use-inbox-tools";
import { useTemplates } from "../use-templates";
import { BroadcastPreviewCard } from "./broadcast-preview";
import { useBroadcastPreview, useCreateBroadcast } from "./use-broadcasts";

/** How many blanks ({{1}}, {{2}}…) a template's words hold. */
const blanksOf = (template: TemplateSummary | undefined) =>
  template === undefined ? 0 : new Set(template.body.match(/\{\{\d+\}\}/g) ?? []).size;

export function NewBroadcastDialog({
  open,
  onOpenChange,
  returnFocusTo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusTo: ReturnFocusTo;
}) {
  const t = useTranslations("inbox.broadcasts.dialog");
  const router = useRouter();
  const formId = useId();
  const templates = useTemplates(open);
  const tags = useTags();
  const [templateId, setTemplateId] = useState("");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [params, setParams] = useState<string[]>([]);
  const [preview, setPreview] = useState<BroadcastPreview | null>(null);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const check = useBroadcastPreview();
  const create = useCreateBroadcast((id) => {
    toast.success(t("started"));
    onOpenChange(false);
    setRequestId(crypto.randomUUID());
    router.push(broadcastRoute(id));
  });
  const approved = (templates.data?.items ?? []).filter((template) => template.status === "approved");
  const blanks = blanksOf(approved.find((template) => template.id === templateId));
  const values = Array.from({ length: blanks }, (_, index) => params[index]?.trim() ?? "");
  const ready = templateId !== "" && tagIds.length > 0 && values.every((value) => value !== "");
  const input = { templateId, tagIds, params: values };
  const change = (work: () => void) => {
    work();
    setPreview(null);
    check.reset();
  };
  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setPreview(null);
      check.reset();
      create.reset();
    }
  };
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={close}
      busy={check.isPending || create.isPending}
      title={t("title")}
      description={t("description")}
      returnFocusTo={returnFocusTo}
      footer={
        preview === null ? (
          <Button type="submit" form={formId} disabled={!ready || check.isPending}>
            {check.isPending ? t("checking") : t("check")}
          </Button>
        ) : (
          <>
            <Button
              variant="outline"
              disabled={create.isPending}
              onClick={() => {
                setPreview(null);
              }}
            >
              {t("back")}
            </Button>
            <Button
              disabled={preview.willSend === 0 || create.isPending}
              onClick={() => {
                create.mutate({ requestId, ...input });
              }}
            >
              {create.isPending ? t("sending") : t("send", { count: preview.willSend })}
            </Button>
          </>
        )
      }
    >
      <form
        id={formId}
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (ready) check.mutate(input, { onSuccess: setPreview });
        }}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${formId}-template`}>{t("template")}</Label>
          {approved.length === 0 && templates.data !== undefined ? (
            <p className="text-muted-foreground">{t("noTemplates")}</p>
          ) : (
            <Select
              value={templateId}
              onValueChange={(chosen) => {
                change(() => {
                  setTemplateId(chosen);
                  setParams([]);
                });
              }}
            >
              <SelectTrigger id={`${formId}-template`} className="w-full">
                <SelectValue placeholder={t("chooseTemplate")} />
              </SelectTrigger>
              <SelectContent>
                {approved.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        {Array.from({ length: blanks }, (_, index) => (
          <div key={index} className="flex flex-col gap-2">
            <Label htmlFor={`${formId}-blank-${String(index)}`}>{t("blank", { number: index + 1 })}</Label>
            <Input
              id={`${formId}-blank-${String(index)}`}
              maxLength={200}
              value={params[index] ?? ""}
              onChange={(event) => {
                change(() => {
                  setParams((held) =>
                    Array.from({ length: blanks }, (_, at) => (at === index ? event.target.value : (held[at] ?? ""))),
                  );
                });
              }}
            />
          </div>
        ))}
        <div className="flex flex-col gap-2">
          <Label id={`${formId}-tags`}>{t("tags")}</Label>
          {tags.data?.length === 0 ? (
            <p className="text-muted-foreground">{t("noTags")}</p>
          ) : (
            <ToggleGroup
              type="multiple"
              variant="outline"
              spacing={2}
              className="flex-wrap"
              aria-labelledby={`${formId}-tags`}
              value={tagIds}
              onValueChange={(chosen) => {
                change(() => {
                  setTagIds(chosen.slice(0, MAX_BROADCAST_TAGS));
                });
              }}
            >
              {(tags.data ?? []).map((tag) => (
                <ToggleGroupItem key={tag.id} value={tag.id} className="rounded-full px-3">
                  {tag.name}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          )}
        </div>
      </form>
      {preview !== null && <BroadcastPreviewCard preview={preview} />}
      <RefusalAlert error={check.error ?? create.error} />
    </ResponsiveDialog>
  );
}
