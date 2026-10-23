"use client";

// A Page's ⋯ menu (spec 3.3): Pause or Resume, Reconnect and Disconnect Page. Pause and Disconnect take reading away, so they
// stay open while the subscription is read-only (ADR 0026); Resume and Reconnect change things, and the menu says why they
// are off.
import { useMutation } from "@tanstack/react-query";
import type { MetaPageDetail } from "@travel-crm/contracts/meta-leads";
import { EllipsisVerticalIcon } from "lucide-react";
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
import { useWriteAccess } from "@/subscription/write-access";
import { useRefreshMeta } from "../use-meta-pages";
import { DisconnectDialog } from "./disconnect-dialog";
import { useReconnect } from "./use-reconnect";

export function PageActions({ detail }: { detail: MetaPageDetail }) {
  const t = useTranslations("metaLeads.page");
  const trpc = useTRPC();
  const change = useWriteAccess("change");
  const revoke = useWriteAccess("revoke");
  const refresh = useRefreshMeta();
  const [disconnecting, setDisconnecting] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const pause = useMutation(trpc.metaLeads.pause.mutationOptions({ onSuccess: refresh }));
  const resume = useMutation(trpc.metaLeads.resume.mutationOptions({ onSuccess: refresh }));
  const reconnect = useReconnect();
  const input = { pageId: detail.id };
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
          {(detail.status === "running" || paused) && (
            <DropdownMenuItem
              disabled={paused ? !change.allowed : !revoke.allowed}
              onSelect={() => {
                (paused ? resume : pause).mutate(input);
              }}
            >
              {paused ? t("resume") : t("pause")}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            disabled={!change.allowed}
            onSelect={() => {
              reconnect.mutate(input);
            }}
          >
            {t("reconnect")}
          </DropdownMenuItem>
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
      <RefusalAlert error={pause.error ?? resume.error ?? reconnect.error} />
      <DisconnectDialog detail={detail} open={disconnecting} onOpenChange={setDisconnecting} returnFocusTo={opener} />
    </>
  );
}
