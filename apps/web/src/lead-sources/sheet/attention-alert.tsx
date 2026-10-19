"use client";

// What a sheet that has stopped says (S39-S44): what happened, since when, and the one thing to do. Lost access (the
// address to share it with again, Check again), a tab that is gone (choose another), columns that are gone (match
// again), no manager (Take over), a read-only subscription and a pause (Resume). Google being busy shows nothing: the
// next check simply goes on.
import { useMutation } from "@tanstack/react-query";
import type { SheetDetail } from "@travel-crm/contracts/sheets";
import { CircleAlertIcon, InfoIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { FormField } from "@/components/form-field";
import { RefusalAlert } from "@/components/refusal-alert";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTRPC } from "@/data/trpc";
import { formatDay } from "@/lib/format";
import { sheetMatchRoute } from "@/lib/routes";
import { useMe } from "@/session/me-context";
import { useWriteAccess, type WriteKind } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { lastCheckedText } from "../last-checked";
import { SheetAddress } from "../sheet-address";
import { useRefreshLeadSheets } from "../use-lead-sheets";

/** The alert's one button, off with its reason while the subscription refuses it. */
function AlertAction({
  kind,
  label,
  pending,
  onClick,
  asLink,
  disabled = false,
}: {
  kind: WriteKind;
  label: string;
  pending?: boolean;
  onClick?: () => void;
  asLink?: string;
  disabled?: boolean;
}) {
  const write = useWriteAccess(kind);
  const hintId = useId();
  return (
    <div className="mt-3 flex flex-col items-start gap-2">
      {asLink !== undefined && write.allowed ? (
        <Button asChild variant="outline">
          <Link href={asLink}>{label}</Link>
        </Button>
      ) : (
        <Button
          variant="outline"
          disabled={!write.allowed || disabled || pending === true}
          aria-describedby={write.hint ? hintId : undefined}
          onClick={onClick}
        >
          {label}
        </Button>
      )}
      <WriteHint id={hintId} hint={write.hint} />
    </div>
  );
}

function AlertFrame({ tone, title, children }: { tone: "info" | "problem"; title: string; children: ReactNode }) {
  const Icon = tone === "problem" ? CircleAlertIcon : InfoIcon;
  return (
    <Alert variant={tone === "problem" ? "destructive" : "default"}>
      <Icon aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}

export function AttentionAlert({ detail }: { detail: SheetDetail }) {
  const t = useTranslations("sheets.sheet.attention");
  const trpc = useTRPC();
  const refresh = useRefreshLeadSheets();
  const { timeZone } = useMe().organization;
  const input = { sheetId: detail.id };
  const recheck = useMutation(trpc.leadSheets.recheck.mutationOptions({ onSuccess: refresh }));
  const takeOver = useMutation(trpc.leadSheets.takeOver.mutationOptions({ onSuccess: refresh }));
  const resume = useMutation(trpc.leadSheets.resume.mutationOptions({ onSuccess: refresh }));
  const checkedAt = detail.lastCheckedAt ?? detail.connectedAt;
  const when = checkedAt === null ? "" : lastCheckedText(new Date(checkedAt), { timeZone });
  const since =
    detail.attentionSince === null
      ? null
      : t("since", { when: formatDay(new Date(detail.attentionSince), { timeZone }) });

  switch (detail.status) {
    case "lost_access":
      return (
        <div className="flex flex-col gap-3">
          <AlertFrame tone="problem" title={t("lost_access.title")}>
            <p>{t("lost_access.body", { when })}</p>
            {since !== null && <p>{since}</p>}
            <div className="mt-3">
              <SheetAddress emails={[detail.serviceAccountEmail]} />
            </div>
            <AlertAction
              kind="change"
              label={t("lost_access.action")}
              pending={recheck.isPending}
              onClick={() => {
                recheck.mutate(input);
              }}
            />
          </AlertFrame>
          <RefusalAlert error={recheck.error} />
        </div>
      );
    case "tab_missing":
      return <TabMissing detail={detail} since={since} />;
    case "columns_missing":
      return (
        <AlertFrame tone="problem" title={t("columns_missing.title")}>
          <p>{t("columns_missing.body", { columns: detail.columns.missing.join(", ") })}</p>
          {since !== null && <p>{since}</p>}
          <AlertAction kind="change" label={t("columns_missing.action")} asLink={sheetMatchRoute(detail.id)} />
        </AlertFrame>
      );
    case "needs_manager":
      return (
        <div className="flex flex-col gap-3">
          <AlertFrame tone="problem" title={t("needs_manager.title")}>
            <p>{t("needs_manager.body")}</p>
            {since !== null && <p>{since}</p>}
            <AlertAction
              kind="change"
              label={t("needs_manager.action")}
              pending={takeOver.isPending}
              onClick={() => {
                takeOver.mutate(input);
              }}
            />
          </AlertFrame>
          <RefusalAlert error={takeOver.error} />
        </div>
      );
    case "paused":
      return (
        <div className="flex flex-col gap-3">
          <AlertFrame tone="info" title={t("paused.title")}>
            <p>{t("paused.body")}</p>
            <AlertAction
              kind="revoke"
              label={t("paused.action")}
              pending={resume.isPending}
              onClick={() => {
                resume.mutate(input);
              }}
            />
          </AlertFrame>
          <RefusalAlert error={resume.error} />
        </div>
      );
    default:
      return detail.readOnly && detail.status === "running" ? (
        <AlertFrame tone="info" title={t("readOnly.title")}>
          <p>{t("readOnly.body")}</p>
        </AlertFrame>
      ) : null;
  }
}

/** The tabs there are now, to choose the one that holds the rows (S40); asks Google once when it opens. */
function TabMissing({ detail, since }: { detail: SheetDetail; since: string | null }) {
  const t = useTranslations("sheets.sheet.attention.tab_missing");
  const trpc = useTRPC();
  const refresh = useRefreshLeadSheets();
  const [tabGid, setTabGid] = useState("");
  const verify = useMutation(trpc.leadSheets.verify.mutationOptions());
  const recheck = useMutation(trpc.leadSheets.recheck.mutationOptions({ onSuccess: refresh }));
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    verify.mutate({ sheetId: detail.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- verify is a new object every render
  }, [detail.id]);
  const tabs = verify.data?.tabs ?? [];
  return (
    <div className="flex flex-col gap-3">
      <AlertFrame tone="problem" title={t("title")}>
        <p>{t("body", { tab: detail.tabTitle })}</p>
        {since !== null && <p>{since}</p>}
        <div className="mt-3 max-w-sm">
          <FormField label={t("label")}>
            {(links) => (
              <Select value={tabGid} onValueChange={setTabGid} disabled={tabs.length === 0}>
                <SelectTrigger {...links} className="h-auto w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  {tabs.map((tab) => (
                    <SelectItem key={tab.gid} value={tab.gid}>
                      {tab.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
        </div>
        <AlertAction
          kind="change"
          label={t("action")}
          pending={recheck.isPending}
          disabled={tabGid === ""}
          onClick={() => {
            recheck.mutate({ sheetId: detail.id, tabGid });
          }}
        />
      </AlertFrame>
      <RefusalAlert error={verify.error ?? recheck.error} />
    </div>
  );
}
