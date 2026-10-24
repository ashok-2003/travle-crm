"use client";

// New template, and Edit and send again for a rejected one (spec 3.4): its name, language, kind (utility or marketing), the words
// with blanks written {{1}}, {{2}}..., an optional footer, and, for each blank, which fact the send dialog fills it from and a
// sample value Meta needs. Meta's rules are checked here first: no blank at the very start or end, none next to another, at
// most 1,024 characters, a sample for every blank. Authentication templates are not offered.
import {
  bodyProblem,
  MAX_TEMPLATE_BODY,
  markersOf,
  templateDraftInput,
  templateLanguages,
  templateVariables,
  type TemplateDraftInput,
  type TemplateSummary,
} from "@travel-crm/contracts/inbox";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Controller, useWatch } from "react-hook-form";
import { FormField } from "@/components/form-field";
import { checked, type Checked } from "@/components/forms/checked";
import { ChoiceField } from "@/components/forms/choice-field";
import { FormAlert, FormDialog, useFormDialog, type OpenState, type Sending } from "@/components/forms/form-dialog";
import { SelectField } from "@/components/forms/select-field";
import { TextField } from "@/components/forms/text-field";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import type { ReturnFocusTo } from "@/components/return-focus";
import { FieldGroup } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { useTRPC } from "@/data/trpc";
import { useRefreshTemplates } from "./use-templates";

interface Values extends Record<string, unknown> {
  name: string;
  language: string;
  category: string;
  body: string;
  footer: string;
  variables: string[];
  samples: string[];
}

type Problem = "required" | "invalid" | "too_long" | "markers" | "edge" | "adjacent" | "samples" | "name";

const slug = (text: string) =>
  text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

function check(values: Values): Checked<Values, TemplateDraftInput, Problem> {
  const count = markersOf(values.body).length;
  const problem = bodyProblem(values.body);
  const found: Partial<Record<string, Problem>> = problem === null || problem === "empty" ? {} : { body: problem };
  return checked<Values, TemplateDraftInput, Problem>(
    templateDraftInput.safeParse({
      name: slug(values.name),
      language: values.language,
      category: values.category,
      body: values.body,
      footer: values.footer.trim() === "" ? null : values.footer,
      // A blank nobody chose a source for is typed by whoever sends.
      variables: Array.from({ length: count }, (_, index) => {
        const chosen = values.variables[index];
        return chosen === undefined || chosen === "" ? "custom" : chosen;
      }),
      samples: values.samples.slice(0, count),
    }),
    values,
    ([key]) =>
      key === "variables" || key === "samples" ? "samples" : typeof key === "string" && key in values ? key : undefined,
    (field) => (field === "name" ? "name" : field === "samples" ? "samples" : "invalid"),
    found,
  );
}

function Form({
  formId,
  existing,
  sending,
}: {
  formId: string;
  existing: TemplateSummary | undefined;
  sending: Sending<TemplateDraftInput>;
}) {
  const t = useTranslations("inbox.templates.form");
  const tProblems = useTranslations("inbox.templates.form.problems");
  const tVariables = useTranslations("inbox.templates.variables");
  const { form, onSubmit, formProblem } = useCheckedForm<Values, TemplateDraftInput, Problem>(
    {
      name: existing?.name ?? "",
      language: existing?.language ?? "en",
      category: existing?.category ?? "utility",
      body: existing?.body ?? "",
      footer: existing?.footer ?? "",
      variables: existing?.variables ?? [],
      samples: existing?.samples ?? [],
    },
    check,
    (problem) => tProblems(problem),
  );
  const body = useWatch({ control: form.control, name: "body" });
  const blanks = markersOf(body).length;
  return (
    <form id={formId} noValidate onSubmit={onSubmit(sending.mutate)} className="flex flex-col gap-6">
      <FieldGroup>
        <TextField
          control={form.control}
          name="name"
          label={t("name")}
          hint={existing === undefined ? t("nameHint") : t("nameFixed")}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          disabled={existing !== undefined}
        />
        <SelectField
          control={form.control}
          name="language"
          label={t("language")}
          placeholder={t("language")}
          options={templateLanguages.map((code) => ({ value: code, label: t(`languages.${code}`) }))}
          disabled={existing !== undefined}
        />
        <ChoiceField
          control={form.control}
          name="category"
          legend={t("category")}
          options={[
            { value: "utility", label: t("utility"), description: t("utilityHint") },
            { value: "marketing", label: t("marketing"), description: t("marketingHint") },
          ]}
        />
        <Controller
          control={form.control}
          name="body"
          render={({ field, fieldState }) => (
            <FormField
              label={t("body")}
              hint={t("bodyHint", { max: MAX_TEMPLATE_BODY })}
              error={fieldState.error?.message}
            >
              {(links) => <Textarea {...links} {...field} dir="auto" rows={5} className="min-h-28" />}
            </FormField>
          )}
        />
        <TextField control={form.control} name="footer" label={t("footer")} autoComplete="off" />
        {Array.from({ length: blanks }, (_, index) => (
          <div key={index} className="flex flex-col gap-4">
            <SelectField
              control={form.control}
              name={`variables.${String(index)}`}
              label={t("blankFrom", { number: index + 1 })}
              placeholder={t("blankFrom", { number: index + 1 })}
              options={templateVariables.map((variable) => ({ value: variable, label: tVariables(variable) }))}
            />
            <TextField
              control={form.control}
              name={`samples.${String(index)}`}
              label={t("blankSample", { number: index + 1 })}
              autoComplete="off"
            />
          </div>
        ))}
      </FieldGroup>
      <FormAlert sending={sending} problem={formProblem} />
    </form>
  );
}

/** New template (no `existing`, with its own button) or Edit and send again (a rejected one, opened from its row). */
export function TemplateDialog({
  existing,
  held,
  returnFocusTo,
}: {
  existing?: TemplateSummary;
  held?: OpenState;
  returnFocusTo?: ReturnFocusTo;
}) {
  const t = useTranslations("inbox.templates.form");
  const trpc = useTRPC();
  const refresh = useRefreshTemplates();
  const dialog = useFormDialog(existing === undefined ? t("created") : t("resent"), refresh, held);
  const create = useMutation(trpc.whatsappTemplates.create.mutationOptions({ onSuccess: dialog.onSuccess }));
  const edit = useMutation(trpc.whatsappTemplates.edit.mutationOptions({ onSuccess: dialog.onSuccess }));
  const sending: Sending<TemplateDraftInput> =
    existing === undefined
      ? create
      : {
          mutate: (draft) => {
            edit.mutate({ templateId: existing.id, draft });
          },
          isPending: edit.isPending,
          error: edit.error,
          reset: edit.reset,
        };
  return (
    <FormDialog
      dialog={dialog}
      sending={sending}
      {...(existing === undefined ? { trigger: { label: t("new"), variant: "default" as const } } : { returnFocusTo })}
      title={existing === undefined ? t("newTitle") : t("editTitle")}
      description={t("description")}
      submit={existing === undefined ? t("submit") : t("resubmit")}
      submitting={t("submitting")}
    >
      {(formId) => <Form formId={formId} existing={existing} sending={sending} />}
    </FormDialog>
  );
}
