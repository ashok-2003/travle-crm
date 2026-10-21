"use client";

// Sync now (S37, S41): checks the sheet at once. It says "Checking…" while the request is out or a check runs, says
// "Checked at …" in a polite status line when the new check ends, and gives the refusal's own sentence for a second press
// ("Just checked").
import { useMutation } from "@tanstack/react-query";
import type { SheetDetail } from "@travel-crm/contracts/sheets";
import { useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";
import { RefusalAlert } from "@/components/refusal-alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useTRPC } from "@/data/trpc";
import { useMe } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { lastCheckedText } from "../last-checked";
import { useRefreshLeadSheets } from "../use-lead-sheets";

export function SyncNowButton({ detail }: { detail: SheetDetail }) {
  const t = useTranslations("sheets.sheet");
  const trpc = useTRPC();
  const write = useWriteAccess("change");
  const hintId = useId();
  const refresh = useRefreshLeadSheets();
  const { timeZone } = useMe().organization;
  // The check is the worker's, and may start and end between two of the page's own refreshes: after a press the page
  // asks every 2 seconds, up to ten times, until the sheet's last check is a new one.
  const [pressed, setPressed] = useState<{ checkedAt: string | null } | null>(null);
  const sync = useMutation(
    trpc.leadSheets.syncNow.mutationOptions({
      onSuccess: async () => {
        setPressed({ checkedAt: detail.lastCheckedAt });
        await refresh();
      },
    }),
  );
  const polling = pressed !== null && pressed.checkedAt === detail.lastCheckedAt;
  // Once the check runs, the page's own query asks every 2 seconds: this waits only for it to start.
  const waiting = polling && !detail.checkRunning;
  useEffect(() => {
    if (!waiting) return;
    let asked = 0;
    const timer = setInterval(() => {
      asked += 1;
      if (asked > 10) setPressed(null);
      else void refresh();
    }, 2000);
    return () => {
      clearInterval(timer);
    };
  }, [waiting, refresh]);
  const checking = sync.isPending || detail.checkRunning;
  const checkedAt = pressed !== null && !polling && !checking ? detail.lastCheckedAt : null;
  const status = checking
    ? t("checking")
    : checkedAt === null
      ? ""
      : t("checkedAt", { when: lastCheckedText(new Date(checkedAt), { timeZone }) });
  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        variant="outline"
        disabled={checking || !write.allowed || detail.status !== "running"}
        aria-describedby={write.hint ? hintId : undefined}
        onClick={() => {
          sync.mutate({ sheetId: detail.id });
        }}
      >
        {checking && <Spinner />}
        {checking ? t("checking") : t("syncNow")}
      </Button>
      <WriteHint id={hintId} hint={write.hint} visible />
      <p role="status" className="sr-only">
        {status}
      </p>
      <RefusalAlert error={sync.error} />
    </div>
  );
}
