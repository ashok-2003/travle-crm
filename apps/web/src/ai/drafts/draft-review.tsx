"use client";

// The review of a package the AI drafted from the agency's documents: every value editable, each beside the line it was read
// from; "check this" and "not found in your documents" marked; documents that disagree offer each alternative, and Save is held
// until each is chosen. Nothing is saved until "Save as package"; then the new package's editor opens.
import type { PackageDraft } from "@travel-crm/contracts/ai";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { RefusalAlert } from "@/components/refusal-alert";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import type { ReturnFocusTo } from "@/components/return-focus";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { packageRoute } from "@/lib/routes";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { DraftDays } from "./draft-days";
import { DraftFields } from "./draft-fields";
import { DraftSeasons } from "./draft-seasons";
import { inputOf, isSaveable, unchosen, valuesOf, type ReviewValues } from "./draft-values";
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
  const form = useForm<ReviewValues>({ defaultValues: valuesOf(draft) });
  const values = useWatch({ control: form.control, compute: (all) => all });
  const left = unchosen(draft, values);
  const canSave = left === 0 && isSaveable(values);

  const save = () => {
    creator.mutate(inputOf(draft, form.getValues()), {
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
            onClick={save}
          >
            {creator.isPending && <Spinner aria-hidden="true" />}
            {t("save")}
          </Button>
          <WriteHint id={`${HINT_ID}-write`} hint={write.hint} />
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <DraftFields draft={draft} control={form.control} setValue={form.setValue} />
        <section aria-labelledby="draft-seasons" className="flex flex-col gap-3">
          <h3 id="draft-seasons" className="font-semibold">
            {t("seasons")}
          </h3>
          <DraftSeasons seasons={draft.seasons} control={form.control} setValue={form.setValue} />
        </section>
        <section aria-labelledby="draft-days" className="flex flex-col gap-3">
          <h3 id="draft-days" className="font-semibold">
            {t("days")}
          </h3>
          <DraftDays draft={draft} control={form.control} />
        </section>
        <RefusalAlert error={creator.error} />
      </div>
    </ResponsiveDialog>
  );
}
