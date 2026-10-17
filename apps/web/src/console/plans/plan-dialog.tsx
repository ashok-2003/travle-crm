"use client";

// The plan form over the page, a dialog on wider screens and a sheet on phones: "New plan" from the screen's header,
// or a change to one plan from its actions: a FormDialog, whose save closes it in the mutation's own onSuccess.
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import { PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { FormDialog } from "@/components/forms/form-dialog";
import { Button } from "@/components/ui/button";
import type { ReturnFocusTo } from "@/components/return-focus";
import { PlanForm } from "./plan-form";
import { useCreatePlan, useUpdatePlan } from "./use-plans";

export function PlanDialog({
  plan,
  open,
  onOpenChange,
  returnFocusTo,
}: {
  /** The plan to change; none for a new plan. */
  plan?: PlanSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The button that opened it, which takes the focus back when it closes. */
  returnFocusTo: ReturnFocusTo;
}) {
  const t = useTranslations("consolePlatform.planForm");
  const close = () => {
    onOpenChange(false);
  };
  const create = useCreatePlan(close);
  const update = useUpdatePlan(close);
  const saving = plan ? update : create;
  return (
    <FormDialog
      returnFocusTo={returnFocusTo}
      dialog={{ open, setOpen: onOpenChange }}
      sending={saving}
      title={plan ? t("editTitle", { name: plan.name }) : t("createTitle")}
      description={plan ? t("editDescription") : t("createDescription")}
      submit={t(plan ? "save" : "create")}
      submitting={t(plan ? "saving" : "creating")}
    >
      {(formId) => (
        <PlanForm
          id={formId}
          plan={plan}
          sending={saving}
          send={(input) => {
            if ("planId" in input) update.mutate(input);
            else create.mutate(input);
          }}
        />
      )}
    </FormDialog>
  );
}

export function NewPlanButton() {
  const t = useTranslations("consolePlatform.plans");
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  return (
    <>
      <Button
        ref={button}
        onClick={() => {
          setOpen(true);
        }}
      >
        <PlusIcon aria-hidden="true" />
        {t("add")}
      </Button>
      <PlanDialog open={open} onOpenChange={setOpen} returnFocusTo={button} />
    </>
  );
}
