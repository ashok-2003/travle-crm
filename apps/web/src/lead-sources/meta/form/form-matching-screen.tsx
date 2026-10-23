"use client";

// /settings/lead-sources/meta/pages/<pageId>/forms/<formId>/bring-in and /questions (spec 3.4): what each question of a lead
// form holds. The same ColumnMatcher the lead import uses, with the form's questions in place of columns: Facebook's own
// name, phone and email questions matched for the person, custom ones guessed from their wording, the rest kept in the
// note. Bringing a form in also asks about leads from before (only new, or also the last 30 days through the import's
// preview, which opens once the worker has read them). Opened again from a brought-in form it saves a new match, which only the leads after it follow.
import { useMutation, useQuery } from "@tanstack/react-query";
import type { MetaFormQuestionsView, MetaEarlierLeadChoice, MetaQuestionField } from "@travel-crm/contracts/meta-leads";
import { metaQuestionField } from "@travel-crm/contracts/meta-leads";
import type { ImportColumn } from "@travel-crm/contracts/imports";
import { LoaderCircleIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ErrorState } from "@/components/error-state";
import { PageHeader } from "@/components/page-header";
import { RefusalAlert } from "@/components/refusal-alert";
import { BackLink } from "@/components/text-link";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldDescription, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useTRPC } from "@/data/trpc";
import { ColumnMatcher } from "@/imports/column-matcher";
import { useLeadFieldOptions } from "@/leads/import/lead-import-fields";
import { metaPageRoute } from "@/lib/routes";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { FieldChecklist } from "../../connect/field-checklist";
import { useMetaPage, useRefreshMeta } from "../use-meta-pages";
import { ReadingEarlier } from "./reading-earlier";

/** A question as the shared matcher shows its column: its place is its position, and the form's example is its sample. */
function asImportColumn(
  question: MetaFormQuestionsView["questions"][number],
  position: number,
  news: string,
): ImportColumn {
  return {
    position,
    header: question.isNew ? `${question.label} · ${news}` : question.label,
    samples: question.example === null ? [] : [question.example],
    values: null,
    field: question.field,
    guessedBy: question.guessedBy === "last-time" ? "last-time" : question.guessedBy === "label" ? "common-name" : null,
  };
}

export function FormMatchingScreen({
  pageId,
  formId,
  mode,
}: {
  pageId: string;
  formId: string;
  mode: "bring-in" | "questions";
}) {
  const t = useTranslations("metaLeads.bringIn");
  const tCommon = useTranslations("common");
  const trpc = useTRPC();
  const router = useRouter();
  const write = useWriteAccess("change");
  const hintId = useId();
  const refresh = useRefreshMeta();
  const page = useMetaPage(pageId);
  // Not Stage (a new lead is always New) and not Owner (leads are given out by the agency's rules).
  const fieldOptions = useLeadFieldOptions().filter(({ field }) => field !== "stage" && field !== "owner");
  const view = useQuery(trpc.metaLeads.formQuestions.queryOptions({ pageId, formId }));
  const [picked, setPicked] = useState<ReadonlyMap<string, MetaQuestionField | null>>(new Map());
  const [earlier, setEarlier] = useState<MetaEarlierLeadChoice>("only_new");
  const [confirming, setConfirming] = useState(false);

  const bringIn = useMutation(
    trpc.metaLeads.bringIn.mutationOptions({
      onSuccess: async (_none, sent) => {
        await refresh();
        // The last 30 days become an import a moment later: the person waits for it (ReadingEarlier).
        if (sent.earlierLeads === "only_new") router.push(metaPageRoute(pageId));
      },
    }),
  );
  const save = useMutation(
    trpc.metaLeads.saveQuestions.mutationOptions({
      onSuccess: async () => {
        toast.success(t("saved"));
        await refresh();
        router.push(metaPageRoute(pageId));
      },
    }),
  );

  const data = view.data;
  if (bringIn.isSuccess && bringIn.variables.earlierLeads === "last_30_days") {
    return <ReadingEarlier pageId={pageId} formId={formId} />;
  }
  const back = <BackLink href={metaPageRoute(pageId)} label={t("back", { page: page.data?.pageName ?? "" })} />;
  if (data === undefined) {
    if (view.isError) {
      return (
        <ErrorState
          message={t("loadFailed")}
          error={view.error}
          retryLabel={tCommon("tryAgain")}
          onRetry={() => void view.refetch()}
        />
      );
    }
    return (
      <div role="status" className="flex items-center gap-3">
        <LoaderCircleIcon aria-hidden="true" className="size-5 motion-safe:animate-spin" />
        <p>{t("reading")}</p>
      </div>
    );
  }

  const fieldOf = (question: MetaFormQuestionsView["questions"][number]) =>
    picked.has(question.key) ? (picked.get(question.key) ?? null) : question.field;
  const columns = data.questions.map((question, position) => asImportColumn(question, position, t("newQuestion")));
  const held = data.questions.map(fieldOf);
  const hasName = held.includes("name");
  const hasContact = held.some((field) => field === "phone" || field === "email" || field === "instagram");
  const busy = bringIn.isPending || save.isPending;
  const matches = data.questions.map((question) => ({ key: question.key, field: fieldOf(question) }));
  const bringing = mode === "bring-in";

  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      {back}
      <PageHeader
        title={t(bringing ? "title" : "titleQuestions", { form: data.form.name })}
        intro={t(bringing ? "intro" : "introQuestions")}
      />
      <FieldChecklist hasName={hasName} hasContact={hasContact} />
      <ColumnMatcher
        columns={columns}
        fields={fieldOptions}
        chosen={new Map(held.map((field, position) => [position, field]))}
        onChoose={(position, field) => {
          const question = data.questions[position];
          const parsed = metaQuestionField.safeParse(field);
          if (question !== undefined) setPicked(new Map(picked).set(question.key, parsed.success ? parsed.data : null));
        }}
        disabled={busy}
        markGuesses
      />
      {bringing && (
        <FieldSet>
          <FieldLegend variant="label">{t("earlier.legend")}</FieldLegend>
          <RadioGroup
            value={earlier}
            onValueChange={(value) => {
              setEarlier(value === "last_30_days" ? "last_30_days" : "only_new");
            }}
          >
            {(
              [
                { value: "only_new", label: t("earlier.onlyNew"), hint: t("earlier.onlyNewHint") },
                { value: "last_30_days", label: t("earlier.last30"), hint: t("earlier.last30Hint") },
              ] as const
            ).map((option) => (
              <Field key={option.value} orientation="horizontal" className="min-h-11">
                <RadioGroupItem id={`earlier-${option.value}`} value={option.value} />
                <FieldContent>
                  <FieldLabel htmlFor={`earlier-${option.value}`} className="font-normal">
                    {option.label}
                  </FieldLabel>
                  <FieldDescription>{option.hint}</FieldDescription>
                </FieldContent>
              </Field>
            ))}
          </RadioGroup>
        </FieldSet>
      )}
      <RefusalAlert error={save.error} />
      <div className="flex flex-col items-start gap-2">
        <Button
          disabled={!hasName || !hasContact || busy || !write.allowed}
          aria-describedby={write.hint ? hintId : undefined}
          onClick={
            bringing
              ? () => {
                  setConfirming(true);
                }
              : () => {
                  save.mutate({ pageId, formId, questions: matches });
                }
          }
        >
          {bringing ? t("action") : t("save")}
        </Button>
        <WriteHint id={hintId} hint={write.hint} />
      </div>
      {bringing && (
        <ConfirmDialog
          open={confirming}
          onOpenChange={setConfirming}
          title={t("confirmTitle", { form: data.form.name })}
          description={t("confirmDescription")}
          action={t("confirmAction")}
          destructive={false}
          request={bringIn}
          onConfirm={() => {
            bringIn.mutate({ pageId, formId, questions: matches, earlierLeads: earlier });
          }}
        />
      )}
    </div>
  );
}
