"use client";

// A sheet's ⋯ menu (spec 6.5): Match columns again, Pause or Resume, Take over (when it needs a manager) and Disconnect.
// Match columns again and Take over change things; Pause, Resume and Disconnect take reading away or give it back, so
// they stay open while the subscription is read-only (S44, ADR 0026), and the menu says why the others are off.
import { useMutation } from "@tanstack/react-query";
import type { SheetDetail } from "@travel-crm/contracts/sheets";
import { EllipsisVerticalIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { RefusalAlert } from "@/components/refusal-alert";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTRPC } from "@/data/trpc";
import { sheetMatchRoute } from "@/lib/routes";
import { useWriteAccess } from "@/subscription/write-access";
import { useRefreshLeadSheets } from "../use-lead-sheets";
import { DisconnectDialog } from "./disconnect-dialog";

const connected = new Set<SheetDetail["status"]>([
  "running",
  "paused",
  "lost_access",
  "tab_missing",
  "columns_missing",
  "needs_manager",
]);

export function SheetActions({ detail }: { detail: SheetDetail }) {
  const t = useTranslations("sheets.sheet");
  const trpc = useTRPC();
  const change = useWriteAccess("change");
  const revoke = useWriteAccess("revoke");
  const refresh = useRefreshLeadSheets();
  const [disconnecting, setDisconnecting] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const pause = useMutation(trpc.leadSheets.pause.mutationOptions({ onSuccess: refresh }));
  const resume = useMutation(trpc.leadSheets.resume.mutationOptions({ onSuccess: refresh }));
  const takeOver = useMutation(trpc.leadSheets.takeOver.mutationOptions({ onSuccess: refresh }));
  const input = { sheetId: detail.id };
  const paused = detail.status === "paused";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button ref={opener} variant="ghost" size="icon" aria-label={t("menu")}>
            <EllipsisVerticalIcon aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className={change.hint === null ? "min-w-52" : "w-72"}>
          {change.hint !== null && (
            <DropdownMenuLabel className="text-caption font-normal">{change.hint}</DropdownMenuLabel>
          )}
          {connected.has(detail.status) && (
            <DropdownMenuItem asChild disabled={!change.allowed}>
              <Link href={sheetMatchRoute(detail.id)}>{t("matchAgain")}</Link>
            </DropdownMenuItem>
          )}
          {detail.status === "needs_manager" && (
            <DropdownMenuItem
              disabled={!change.allowed}
              onSelect={() => {
                takeOver.mutate(input);
              }}
            >
              {t("takeOver")}
            </DropdownMenuItem>
          )}
          {(detail.status === "running" || paused) && (
            <DropdownMenuItem
              disabled={!revoke.allowed}
              onSelect={() => {
                (paused ? resume : pause).mutate(input);
              }}
            >
              {paused ? t("resume") : t("pause")}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            disabled={!revoke.allowed}
            onSelect={() => {
              setDisconnecting(true);
            }}
          >
            {t("disconnect")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <RefusalAlert error={pause.error ?? resume.error ?? takeOver.error} />
      <DisconnectDialog detail={detail} open={disconnecting} onOpenChange={setDisconnecting} returnFocusTo={opener} />
    </>
  );
}
