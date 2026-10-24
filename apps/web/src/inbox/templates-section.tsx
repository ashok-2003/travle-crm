"use client";

// Templates on /settings/whatsapp (spec 3.4): a table of every template but the archived (name, kind, language, status with
// Meta's reason when rejected, last used), New template, Refresh status, Edit and send again for a rejected one written here,
// and Archive. The month's marketing messages against the agency's cap sit above it.
import { PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { RefusalAlert } from "@/components/refusal-alert";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDay } from "@/lib/format";
import { useMe } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import type { TemplateSummary } from "@travel-crm/contracts/inbox";
import { TemplateDialog } from "./template-form";
import { useTemplateActions, useTemplates } from "./use-templates";

const tones: Record<string, StatusTone> = {
  approved: "good",
  pending: "attention",
  rejected: "bad",
  paused: "attention",
  disabled: "neutral",
  draft: "neutral",
};

function Row({ template }: { template: TemplateSummary }) {
  const t = useTranslations("inbox.templates");
  const { timeZone } = useMe().organization;
  const access = useWriteAccess("change");
  const { archive } = useTemplateActions();
  const [editing, setEditing] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const editButton = useRef<HTMLButtonElement>(null);
  const archiveButton = useRef<HTMLButtonElement>(null);
  return (
    <TableRow>
      <TableCell className="script-leading">
        <p className="numbers">{template.name}</p>
        <p className="text-caption text-muted-foreground wrap-anywhere" dir="auto">
          {template.body}
        </p>
      </TableCell>
      <TableCell>{t(`category.${template.category}`)}</TableCell>
      <TableCell className="numbers">{template.language}</TableCell>
      <TableCell>
        <StatusBadge tone={tones[template.status] ?? "neutral"}>{t(`status.${template.status}`)}</StatusBadge>
        {template.status === "rejected" && template.reason !== null && (
          <p className="text-caption text-muted-foreground">{t("reason", { reason: template.reason })}</p>
        )}
      </TableCell>
      <TableCell>
        {template.lastUsedAt === null ? t("neverUsed") : formatDay(new Date(template.lastUsedAt), { timeZone })}
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-2">
          {template.status === "rejected" && template.madeHere && (
            <>
              <Button
                ref={editButton}
                variant="outline"
                size="sm"
                disabled={!access.allowed}
                onClick={() => {
                  setEditing(true);
                }}
              >
                {t("editAgain")}
              </Button>
              {editing && (
                <TemplateDialog
                  existing={template}
                  held={{ open: editing, setOpen: setEditing }}
                  returnFocusTo={editButton}
                />
              )}
            </>
          )}
          <Button
            ref={archiveButton}
            variant="outline"
            size="sm"
            disabled={!access.allowed}
            onClick={() => {
              setArchiving(true);
            }}
          >
            {t("archive")}
          </Button>
          <ConfirmDialog
            open={archiving}
            onOpenChange={setArchiving}
            title={t("archiveTitle", { name: template.name })}
            description={t("archiveDescription")}
            action={t("archive")}
            destructive={false}
            request={archive}
            onConfirm={() => {
              archive.mutate(
                { templateId: template.id },
                {
                  onSuccess: () => {
                    setArchiving(false);
                  },
                },
              );
            }}
            returnFocusTo={archiveButton}
          />
        </div>
      </TableCell>
    </TableRow>
  );
}

export function TemplatesSection() {
  const t = useTranslations("inbox.templates");
  const list = useTemplates();
  const { sync } = useTemplateActions();
  const access = useWriteAccess("change");
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
        <LoadingRows shape="table" columns={6} label={t("loading")} />
      );
    }
    if (list.data.items.length === 0) return <EmptyState icon={PlusIcon} message={t("empty")} />;
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("columns.name")}</TableHead>
            <TableHead>{t("columns.category")}</TableHead>
            <TableHead>{t("columns.language")}</TableHead>
            <TableHead>{t("columns.status")}</TableHead>
            <TableHead>{t("columns.lastUsed")}</TableHead>
            <TableHead>
              <span className="sr-only">{t("columns.actions")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.data.items.map((template) => (
            <Row key={template.id} template={template} />
          ))}
        </TableBody>
      </Table>
    );
  };
  return (
    <section aria-labelledby="templates-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="templates-heading" className="text-section font-semibold">
          {t("title")}
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={sync.isPending || !access.allowed}
            onClick={() => {
              sync.mutate(undefined);
            }}
          >
            {t("refresh")}
          </Button>
          <TemplateDialog />
        </div>
      </div>
      <p className="text-muted-foreground">{t("intro")}</p>
      {list.data !== undefined && (
        <p className="numbers text-label">
          {t("marketingUsed", { used: list.data.marketingUsed, cap: list.data.marketingCap })}
        </p>
      )}
      <RefusalAlert error={sync.error} />
      {body()}
    </section>
  );
}
