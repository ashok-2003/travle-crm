"use client";

// Broadcasts on /settings/whatsapp (sales inbox spec 6), for the Owner and Admins: an approved template to every chat
// with a tag, through the ordinary template send, so a person who never agreed or said STOP, and the month's marketing
// cap, are each respected (those chats are counted as skipped). The blanks are the same for everyone. Then the last
// broadcasts, with how many went and how many were skipped.
import type { TemplateSummary } from "@travel-crm/contracts/inbox";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { RefusalAlert } from "@/components/refusal-alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDay } from "@/lib/format";
import { useMe } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { useTags } from "./use-inbox-tools";
import { useBroadcastReach, useBroadcasts, useSendBroadcast } from "./use-sales-inbox";
import { useTemplates } from "./use-templates";

/** How many blanks ({{1}}, {{2}}…) a template's words hold. */
const blanksOf = (template: TemplateSummary | undefined) =>
  template === undefined ? 0 : new Set(template.body.match(/\{\{\d+\}\}/g) ?? []).size;

export function BroadcastSection() {
  const t = useTranslations("inbox.broadcast");
  const { timeZone } = useMe().organization;
  const access = useWriteAccess("change");
  const templates = useTemplates();
  const tags = useTags();
  const history = useBroadcasts(true);
  const send = useSendBroadcast();
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [tagId, setTagId] = useState<string | null>(null);
  const [params, setParams] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const reach = useBroadcastReach(tagId);
  const approved = (templates.data?.items ?? []).filter((template) => template.status === "approved");
  const template = approved.find((candidate) => candidate.id === templateId);
  const blanks = blanksOf(template);
  const ready =
    template !== undefined &&
    tagId !== null &&
    params.slice(0, blanks).filter((value) => value.trim() !== "").length === blanks;
  return (
    <section aria-labelledby="broadcast-heading" className="flex flex-col gap-4">
      <h2 id="broadcast-heading" className="text-section font-semibold">
        {t("title")}
      </h2>
      <p className="max-w-[65ch] text-muted-foreground">{t("intro")}</p>
      <Card>
        <CardHeader>
          <CardTitle>{t("newTitle")}</CardTitle>
          <CardDescription>{t("newIntro")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label>{t("template")}</Label>
              <Select
                value={templateId ?? ""}
                onValueChange={(chosen) => {
                  setTemplateId(chosen);
                  setParams([]);
                }}
              >
                <SelectTrigger aria-label={t("template")} className="w-full">
                  <SelectValue placeholder={t("chooseTemplate")} />
                </SelectTrigger>
                <SelectContent>
                  {approved.map((candidate) => (
                    <SelectItem key={candidate.id} value={candidate.id}>
                      {candidate.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>{t("tag")}</Label>
              <Select value={tagId ?? ""} onValueChange={setTagId}>
                <SelectTrigger aria-label={t("tag")} className="w-full">
                  <SelectValue placeholder={t("chooseTag")} />
                </SelectTrigger>
                <SelectContent>
                  {(tags.data ?? []).map((tag) => (
                    <SelectItem key={tag.id} value={tag.id}>
                      {tag.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {template !== undefined && (
            <p className="rounded-lg bg-chat-bubble-out p-3 whitespace-pre-wrap script-leading" dir="auto">
              {template.body}
            </p>
          )}
          {Array.from({ length: blanks }, (_, index) => (
            <div key={index} className="flex flex-col gap-2 sm:max-w-sm">
              <Label htmlFor={`broadcast-blank-${String(index)}`}>{t("blank", { number: index + 1 })}</Label>
              <Input
                id={`broadcast-blank-${String(index)}`}
                maxLength={200}
                value={params[index] ?? ""}
                onChange={(event) => {
                  const next = [...params];
                  next[index] = event.target.value;
                  setParams(next);
                }}
              />
            </div>
          ))}
          {tagId !== null && reach.data !== undefined && (
            <p className="text-label">{t("reach", { count: reach.data.chats })}</p>
          )}
          <RefusalAlert error={send.error} />
          <Button
            ref={button}
            type="button"
            className="self-start"
            disabled={!access.allowed || !ready || send.isPending || reach.data?.chats === 0}
            onClick={() => {
              setConfirming(true);
            }}
          >
            {t("send")}
          </Button>
          <ConfirmDialog
            open={confirming}
            onOpenChange={setConfirming}
            title={t("confirmTitle", { count: reach.data?.chats ?? 0 })}
            description={t("confirmDescription")}
            action={t("send")}
            destructive={false}
            request={send}
            onConfirm={() => {
              if (template === undefined || tagId === null) return;
              send.mutate(
                { templateId: template.id, tagId, params: params.slice(0, blanks).map((value) => value.trim()) },
                {
                  onSuccess: (result) => {
                    setConfirming(false);
                    toast.success(t("sent", { sent: result.sent, skipped: result.skipped }));
                  },
                },
              );
            }}
            returnFocusTo={button}
          />
        </CardContent>
      </Card>
      {history.data !== undefined && history.data.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("columns.when")}</TableHead>
              <TableHead>{t("columns.template")}</TableHead>
              <TableHead>{t("columns.tag")}</TableHead>
              <TableHead className="text-right">{t("columns.sent")}</TableHead>
              <TableHead className="text-right">{t("columns.skipped")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {history.data.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{formatDay(new Date(row.createdAt), { timeZone })}</TableCell>
                <TableCell className="numbers">{row.templateName}</TableCell>
                <TableCell>{row.tagName}</TableCell>
                <TableCell className="numbers text-right">{row.sent}</TableCell>
                <TableCell className="numbers text-right">{row.skipped}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
