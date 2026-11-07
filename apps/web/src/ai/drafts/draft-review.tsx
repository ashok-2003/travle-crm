"use client";

// The review of a package the AI drafted from the agency's documents: every value editable, each beside the line it was read
// from; "check this" and "not found in your documents" marked; documents that disagree offer each alternative, and Save is held
// until each is chosen. Nothing is saved until "Save as package"; then the new package's editor opens.
import type { CreateGroupPackageInput, PackageDraft } from "@travel-crm/contracts/ai";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useId } from "react";
import { useWatch } from "react-hook-form";
import { toast } from "sonner";
import { RefusalAlert } from "@/components/refusal-alert";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { useRefusalOnField } from "@/components/forms/use-refusal-on-field";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import type { ReturnFocusTo } from "@/components/return-focus";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { packageRoute } from "@/lib/routes";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { DraftDays } from "./draft-days";
import { DraftFields } from "./draft-fields";
import { DraftSeasons } from "./draft-seasons";
import { checkReview, unchosen, valuesOf, type ReviewProblem, type ReviewValues } from "./draft-values";
import { useCreateGroupPackage } from "./use-package-drafts";

const HINT_ID = "draft-review-hint";

export function DraftReview({
  draft,
  open,
  onOpenChange,
  returnFocusTo,
}: {
  draft: PackageDraft;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusTo?: ReturnFocusTo | undefined;
}) {
  const t = useTranslations("ai.drafts.review");
  const router = useRouter();
  const write = useWriteAccess("change");
  const creator = useCreateGroupPackage();
  const formId = useId();
  const { form, onSubmit, formProblem } = useCheckedForm<ReviewValues, CreateGroupPackageInput, ReviewProblem>(
    valuesOf(draft),
    (typed) => checkReview(draft, typed),
    (problem) => t(`problems.${problem}`),
  );
  const values = useWatch({ control: form.control, compute: (all) => all });
  const left = unchosen(draft, values);
  const canSave = left === 0 && checkReview(draft, values).ok;
  // A field is checked as it is changed, so its problem shows as the owner types; the rest show when Save is pressed.
  useEffect(() => {
    const subscription = form.watch((_, { name }) => {
      if (name !== undefined) void form.trigger(name);
    });
    return () => {
      subscription.unsubscribe();
    };
  }, [form]);
  const refusal = useRefusalOnField(form, creator.error, { PACKAGE_NAME_TAKEN: "name" });

  const save = (input: CreateGroupPackageInput) => {
    creator.mutate(input, {
      onSuccess: (created) => {
        if (created.brochure === "failed")
          toast.warning(t("brochureFailed"), { duration: Infinity, closeButton: true });
        else toast.success(t("saved"));
        router.push(packageRoute(created.id));
        onOpenChange(false);
      },
    });
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      busy={creator.isPending}
      wide
      returnFocusTo={returnFocusTo}
      title={t("title")}
      description={t("description")}
      footer={
        <>
          <p id={HINT_ID} className="text-caption text-muted-foreground sm:order-first sm:mr-auto sm:self-center">
            {left > 0 ? t("choicesLeft", { count: left }) : canSave ? t("ready") : t("fixFirst")}
          </p>
          <Button
            disabled={!canSave || creator.isPending || !write.allowed}
            aria-describedby={`${HINT_ID} ${HINT_ID}-write`}
            type="submit"
            form={formId}
          >
            {creator.isPending && <Spinner aria-hidden="true" />}
            {t("save")}
          </Button>
          <WriteHint id={`${HINT_ID}-write`} hint={write.hint} />
        </>
      }
    >
      <form id={formId} noValidate onSubmit={onSubmit(save)} className="flex flex-col gap-6">
        <DraftFields draft={draft} control={form.control} setValue={form.setValue} />
        <section aria-labelledby="draft-seasons" className="flex flex-col gap-3">
          <h3 id="draft-seasons" className="font-semibold">
            {t("seasons")}
          </h3>
          <DraftSeasons seasons={draft.seasons} control={form.control} setValue={form.setValue} />
          <FieldError>{form.formState.errors.seasons?.message}</FieldError>
        </section>
        <section aria-labelledby="draft-days" className="flex flex-col gap-3">
          <h3 id="draft-days" className="font-semibold">
            {t("days")}
          </h3>
          <DraftDays draft={draft} control={form.control} />
          <FieldError>{form.formState.errors.days?.message}</FieldError>
        </section>
        <FieldError>{formProblem}</FieldError>
        <RefusalAlert error={refusal} />
      </form>
    </ResponsiveDialog>
  );
}
