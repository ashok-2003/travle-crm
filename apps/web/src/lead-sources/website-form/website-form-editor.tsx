"use client";

// The form's settings as one form (spec 3.2, items 2 to 6): started from the saved settings, kept in step with them
// while nothing is edited, and saved together by Save. Leaving with edits asks once.
import type { SaveWebsiteFormInput, WebsiteFormView } from "@travel-crm/contracts/website-forms";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { useRefusalOnField } from "@/components/forms/use-refusal-on-field";
import { FieldsCard } from "./fields-card";
import { checkValues, valuesOf, type FormProblem, type FormValues } from "./form-values";
import { LookCard } from "./look-card";
import { PreviewButton } from "./preview-dialog";
import { ShareCard } from "./share-card";
import { SaveBar } from "./save-bar";
import type { useWebsiteForm } from "./use-website-form";
import { LeaveGuard } from "./use-leave-guard";
import { WordsCard } from "./words-card";

export function WebsiteFormEditor({
  view,
  save,
  children,
}: {
  view: WebsiteFormView;
  save: ReturnType<typeof useWebsiteForm>["save"];
  /** What reads between the cards and Save: the counts and the help. */
  children?: ReactNode;
}) {
  const t = useTranslations("websiteFormSettings.problems");
  const tErrors = useTranslations("errors.reasons");
  const { form, onSubmit } = useCheckedForm<FormValues, SaveWebsiteFormInput, FormProblem>(
    valuesOf(view.settings),
    checkValues,
    (problem) => (problem === "link" ? tErrors("FORM_LINK_INVALID") : t(problem)),
  );
  // A refusal about the website address is said on its field; others stay in Save's alert.
  const unplaced = useRefusalOnField(form, save.error, { FORM_LINK_INVALID: "websiteUrl" });
  const dirty = form.formState.isDirty;

  // Another save or another admin changed the settings: untouched fields follow them, edits are kept.
  useEffect(() => {
    if (!form.formState.isDirty) form.reset(valuesOf(view.settings));
  }, [form, view.settings]);

  return (
    <form
      noValidate
      className="flex flex-col gap-6"
      onSubmit={onSubmit((input) => {
        save.mutate(input, {
          onSuccess: (next) => {
            // What was typed while the save was out stays, and stays unsaved.
            form.reset(valuesOf(next.settings), { keepDirtyValues: true });
          },
        });
      })}
    >
      <ShareCard view={view} control={form.control} />
      <FieldsCard control={form.control} />
      <WordsCard control={form.control} />
      <LookCard />
      <PreviewButton getValues={form.getValues} />
      {children}
      <SaveBar dirty={dirty} saving={save.isPending} error={unplaced} />
      <LeaveGuard dirty={dirty} />
    </form>
  );
}
