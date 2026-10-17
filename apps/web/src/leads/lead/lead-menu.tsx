"use client";

// A lead's ⋯ menu (spec 3.4, R33, P2): Reassign (leads:assign), Lost and Not a lead (leads:edit; not the stage the lead
// is in), and Block this number (leads:assign), which blocks the phone, else the email, else the handle, and marks the
// lead Not a lead. Lost, Not a lead and Block ask first (ConfirmDialog, held while the request is out); Reassign opens
// its dialog; each gives the focus back to the ⋯ button when it closes. While the subscription refuses changes, the
// items are off and the menu says why.
import type { LeadDetail } from "@travel-crm/contracts/crm";
import { EllipsisVerticalIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useHolds } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { ReassignDialog } from "./reassign-dialog";
import { useBlockContact, useMoveStage } from "./use-lead";

type Asking = "reassign" | "lost" | "notALead" | "block" | null;

export function LeadMenu({ lead }: { lead: LeadDetail }) {
  const t = useTranslations("leads.lead");
  const canEdit = useHolds("leads:edit");
  const canAssign = useHolds("leads:assign");
  const write = useWriteAccess("change");
  const [asking, setAsking] = useState<Asking>(null);
  // The dialogs aren't the menu's: closed, saved or cancelled, they give the focus back to the ⋯ button.
  const opener = useRef<HTMLButtonElement>(null);
  const close = () => {
    setAsking(null);
  };
  const move = useMoveStage(close);
  const block = useBlockContact(close);
  const closes = canEdit ? (["lost", "notALead"] as const) : [];
  const offered = closes.filter((item) => (item === "lost" ? lead.stage !== "lost" : lead.stage !== "not_a_lead"));
  if (!canAssign && offered.length === 0) return null;

  const name = lead.person.name;
  const item = (choice: Exclude<Asking, null>, words: string, destructive = false) => (
    <DropdownMenuItem
      key={choice}
      variant={destructive ? "destructive" : "default"}
      disabled={!write.allowed}
      onSelect={() => {
        setAsking(choice);
      }}
    >
      {words}
    </DropdownMenuItem>
  );
  const onOpenChange = (open: boolean) => {
    if (!open) close();
  };
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button ref={opener} variant="ghost" size="icon" aria-label={t("menu.label", { name })}>
            <EllipsisVerticalIcon aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className={write.hint === null ? "min-w-52" : "w-72"}>
          {write.hint !== null && (
            <DropdownMenuLabel className="text-caption font-normal">{write.hint}</DropdownMenuLabel>
          )}
          {canAssign && item("reassign", t("menu.reassign"))}
          {canAssign && offered.length > 0 && <DropdownMenuSeparator />}
          {offered.map((choice) => item(choice, t(`menu.${choice}`)))}
          {canAssign && <DropdownMenuSeparator />}
          {canAssign && item("block", lead.person.phone ? t("menu.block") : t("menu.blockContact"), true)}
        </DropdownMenuContent>
      </DropdownMenu>
      {asking === "reassign" && <ReassignDialog lead={lead} open onOpenChange={onOpenChange} returnFocusTo={opener} />}
      {(asking === "lost" || asking === "notALead") && (
        <ConfirmDialog
          open
          onOpenChange={onOpenChange}
          returnFocusTo={opener}
          title={t(`${asking}.title`, { name })}
          description={t(`${asking}.description`)}
          action={t(`${asking}.confirm`)}
          request={move}
          onConfirm={() => {
            move.mutate({ leadId: lead.id, stage: asking === "lost" ? "lost" : "not_a_lead" });
          }}
        />
      )}
      {asking === "block" && (
        <ConfirmDialog
          open
          onOpenChange={onOpenChange}
          returnFocusTo={opener}
          title={t("block.title", { name })}
          description={t("block.description")}
          action={t("block.confirm")}
          request={block}
          onConfirm={() => {
            block.mutate({ leadId: lead.id });
          }}
        />
      )}
    </>
  );
}
