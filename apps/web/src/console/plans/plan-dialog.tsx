"use client";

// The plan form over the page, a dialog on wider screens and a sheet on phones: "New plan" from the screen's header,
// or a change to one plan from its actions. The save is the dialog's, and closes it once the api has saved the plan
// (the mutation's own onSuccess); while it is out nothing closes the dialog.
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import { PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { PlanForm } from "./plan-form";
import { useCreatePlan, useUpdatePlan } from "./use-plans";

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
  const formId = useId();
  const close = () => {
    onOpenChange(false);
  };
  const create = useCreatePlan(close);
  const update = useUpdatePlan(close);
  const saving = plan ? update : create;
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        // A refusal from an earlier try isn't the next one's.
        if (!next) saving.reset();
        onOpenChange(next);
      }}
      busy={saving.isPending}
      title={plan ? t("editTitle", { name: plan.name }) : t("createTitle")}
      description={plan ? t("editDescription") : t("createDescription")}
      footer={
        <Button type="submit" form={formId} disabled={saving.isPending}>
          {saving.isPending && <Spinner />}
          {t(saving.isPending ? (plan ? "saving" : "creating") : plan ? "save" : "create")}
        </Button>
      }
    >
      {open && (
        <PlanForm
          id={formId}
          plan={plan}
          error={saving.error}
          send={(input) => {
            if ("planId" in input) update.mutate(input);
            else create.mutate(input);
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
