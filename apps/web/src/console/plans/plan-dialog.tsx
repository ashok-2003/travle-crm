"use client";

// The plan form over the page, a dialog on wider screens and a sheet on phones: "New plan" from the screen's header,
// or a change to one plan from its actions. It closes once the api has saved the plan.
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import { PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ResponsiveDialog } from "@/organization/responsive-dialog";
import { PlanForm } from "./plan-form";

export function PlanDialog({
  plan,
  open,
  onOpenChange,
}: {
  /** The plan to change; none for a new plan. */
  plan?: PlanSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("consolePlatform.planForm");
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={plan ? t("editTitle", { name: plan.name }) : t("createTitle")}
      description={plan ? t("editDescription") : t("createDescription")}
    >
      {open && (
        <PlanForm
          plan={plan}
          onSaved={() => {
            onOpenChange(false);
          }}
        />
      )}
    </ResponsiveDialog>
  );
}

export function NewPlanButton() {
  const t = useTranslations("consolePlatform.plans");
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        onClick={() => {
          setOpen(true);
        }}
      >
        <PlusIcon aria-hidden="true" />
        {t("add")}
      </Button>
      <PlanDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
