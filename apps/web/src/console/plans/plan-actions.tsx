"use client";

// A super admin's actions on one plan: change it, or archive it. The demo's own plan is never archived (the api
// refuses: DEMO_PLAN_LOCKED), so it offers only a change.
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import { EllipsisVerticalIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArchivePlanDialog } from "./archive-plan-dialog";
import { PlanDialog } from "./plan-dialog";

type OpenDialog = "edit" | "archive" | null;

export function PlanActions({ plan }: { plan: PlanSummary }) {
  const t = useTranslations("consolePlatform.plans");
  const [open, setOpen] = useState<OpenDialog>(null);
  const closeWhen = (dialog: Exclude<OpenDialog, null>) => (next: boolean) => {
    setOpen(next ? dialog : null);
  };
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t("actionsFor", { name: plan.name })}>
            <EllipsisVerticalIcon aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() => {
              setOpen("edit");
            }}
          >
            {t("edit")}
          </DropdownMenuItem>
          {plan.forSale && (
            <DropdownMenuItem
              className="text-destructive"
              onSelect={() => {
                setOpen("archive");
              }}
            >
              {t("archive")}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {open === "edit" && <PlanDialog plan={plan} open onOpenChange={closeWhen("edit")} />}
      {open === "archive" && <ArchivePlanDialog plan={plan} open onOpenChange={closeWhen("archive")} />}
    </>
  );
}
