"use client";

// What a sheet that has stopped says (S39-S44): what happened, since when, and the one thing to do. Lost access (the
// address to share it with again, Check again), a tab that is gone (choose another), columns that are gone (match
// again), no manager (Take over), a read-only subscription and a pause (Resume). Google being busy shows nothing: the
// next check simply goes on.
import { useMutation } from "@tanstack/react-query";
import type { SheetDetail } from "@travel-crm/contracts/sheets";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { FormField } from "@/components/form-field";
import { RefusalAlert } from "@/components/refusal-alert";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTRPC } from "@/data/trpc";
import { formatDay } from "@/lib/format";
import { focusPageHeading } from "@/lib/focus-page-heading";
import { sheetMatchRoute } from "@/lib/routes";
import { useMe } from "@/session/me-context";
import { AlertAction, AlertFrame } from "../attention-parts";
import { SheetAddress } from "../sheet-address";
import { useRefreshLeadSheets } from "../use-lead-sheets";

/** What every alert button does when its request ends: loads the sheet again, and moves the focus off the button that goes. */
function useAlertDone() {
  const refresh = useRefreshLeadSheets();
  return async () => {
    await refresh();
    focusPageHeading();
  };
}

export function AttentionAlert({ detail }: { detail: SheetDetail }) {
  const t = useTranslations("sheets.sheet.attention");
  const tSheet = useTranslations("sheets.sheet");
  const trpc = useTRPC();
  const done = useAlertDone();
  const { timeZone } = useMe().organization;
  const input = { sheetId: detail.id };
  const recheck = useMutation(trpc.leadSheets.recheck.mutationOptions({ onSuccess: done }));
  const takeOver = useMutation(trpc.leadSheets.takeOver.mutationOptions({ onSuccess: done }));
  // Resume gives reading back, but it is the "revoke" kind (S41, S44): like Pause and Disconnect it undoes a stop the
  // person asked for, so it stays open while the subscription is read-only.
  const resume = useMutation(trpc.leadSheets.resume.mutationOptions({ onSuccess: done }));
  const since =
    detail.attentionSince === null
      ? null
      : t("since", { when: formatDay(new Date(detail.attentionSince), { timeZone }) });

  switch (detail.status) {
    case "lost_access":
      return (
        <div className="flex flex-col gap-3">
          <AlertFrame tone="problem" title={t("lost_access.title")}>
            <p>{t("lost_access.body")}</p>
            {since !== null && <p>{since}</p>}
            <div className="mt-3">
              <SheetAddress emails={[detail.serviceAccountEmail]} />
            </div>
            <AlertAction
              kind="change"
              label={t("lost_access.action")}
              pending={recheck.isPending}
              pendingLabel={tSheet("checking")}
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
          <p>
            {t("columns_missing.body", {
              columns: new Intl.ListFormat("en-IN", { type: "conjunction" }).format(detail.columns.missing),
            })}
          </p>
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
  const tCommon = useTranslations("common");
  const done = useAlertDone();
  const [tabGid, setTabGid] = useState("");
  const verify = useMutation(trpc.leadSheets.verify.mutationOptions());
  const recheck = useMutation(trpc.leadSheets.recheck.mutationOptions({ onSuccess: done }));
  // Google is asked once per visit, when the screen opens, and again only when the person asks (Try again).
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
                  <SelectValue placeholder={t("placeholder")} />
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
        {verify.isError && (
          <Button
            variant="outline"
            className="mt-3"
            disabled={verify.isPending}
            onClick={() => {
              verify.mutate({ sheetId: detail.id });
            }}
          >
            {tCommon("tryAgain")}
          </Button>
        )}
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
