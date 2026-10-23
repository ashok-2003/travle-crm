"use client";

// Sync now (S37, S41): checks the sheet at once; the shared Check now button does the waiting and the saying.
import { useMutation } from "@tanstack/react-query";
import type { SheetDetail } from "@travel-crm/contracts/sheets";
import { useTranslations } from "next-intl";
import { useTRPC } from "@/data/trpc";
import { CheckNowButton } from "../check-now-button";
import { useRefreshLeadSheets } from "../use-lead-sheets";

export function SyncNowButton({ detail }: { detail: SheetDetail }) {
  const t = useTranslations("sheets.sheet");
  const trpc = useTRPC();
  const refresh = useRefreshLeadSheets();
  const sync = useMutation(trpc.leadSheets.syncNow.mutationOptions());
  return (
    <CheckNowButton
      lastCheckedAt={detail.lastCheckedAt}
      checkRunning={detail.checkRunning}
      canCheck={detail.status === "running"}
      action={t("syncNow")}
      checking={t("checking")}
      checkedAt={(when) => t("checkedAt", { when })}
      check={() => sync.mutateAsync({ sheetId: detail.id })}
      pending={sync.isPending}
      error={sync.error}
      refresh={refresh}
    />
  );
}
