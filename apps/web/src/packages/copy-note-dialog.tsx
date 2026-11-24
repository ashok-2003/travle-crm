"use client";

// "Copy a line to other trips", in Details & rules: one line of the notes ("No single rooms from 18 Dec", the notes'
// first line unless the person types another) put first in the notes of the agency's other trips they tick
// (packages.copyNote), so the part the AI keeps when it shortens notes has it. Afterwards the dialog says how many took
// it and names those skipped and why: they had it already, or their notes had no room. No AI.
import {
  copyNoteInput,
  MAX_COPY_TRIPS,
  type CopyNoteInput,
  type CopyNoteResult,
  type PackageDetail,
  type QuotePackage,
} from "@travel-crm/contracts/quotes";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { Controller } from "react-hook-form";
import { FieldProblem } from "@/components/form-field";
import { checked } from "@/components/forms/checked";
import { FormAlert, FormDialog } from "@/components/forms/form-dialog";
import { TextField } from "@/components/forms/text-field";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { LoadFailedAlert } from "@/components/load-failed-alert";
import { LoadingRows } from "@/components/loading-rows";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { useQuotePackages } from "@/quotes/use-quotes";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { usePackageChanges } from "./use-packages";

type Problem = "required" | "invalid" | "noTrip" | "tooManyTrips";
interface Values {
  line: string;
  packageIds: string[];
}

/** The notes' first line with words in it. */
const firstLine = (notes: string) =>
  notes
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line !== "") ?? "";

function Outcome({ result, trips }: { result: CopyNoteResult; trips: readonly QuotePackage[] }) {
  const t = useTranslations("packages.copyNote");
  const names = (ids: readonly string[]) => ids.map((id) => trips.find((one) => one.id === id)?.name ?? "").join(", ");
  return (
    <div className="flex flex-col gap-2" aria-live="polite">
      <p className="font-medium">{t("copied", { count: result.copied.length })}</p>
      {result.alreadyThere.length > 0 && (
        <p className="text-muted-foreground">{t("alreadyThere", { trips: names(result.alreadyThere) })}</p>
      )}
      {result.tooLong.length > 0 && (
        <p className="text-muted-foreground">{t("tooLong", { trips: names(result.tooLong) })}</p>
      )}
    </div>
  );
}

function CopyNoteForm({
  formId,
  detail,
  others,
  copyNote,
  result,
  setResult,
}: {
  formId: string;
  detail: PackageDetail;
  others: readonly QuotePackage[];
  copyNote: ReturnType<typeof usePackageChanges>["copyNote"];
  result: CopyNoteResult | null;
  setResult: (result: CopyNoteResult) => void;
}) {
  const t = useTranslations("packages.copyNote");
  const problemId = `${formId}-trips-problem`;
  const { form, onSubmit, formProblem } = useCheckedForm<Values, CopyNoteInput, Problem>(
    { line: firstLine(detail.notes), packageIds: [] },
    (typed) =>
      checked(
        copyNoteInput.safeParse(typed),
        typed,
        ([key]) => (key === "line" || key === "packageIds" ? key : undefined),
        (field) => {
          if (field !== "packageIds") return "invalid";
          return typed.packageIds.length > MAX_COPY_TRIPS ? "tooManyTrips" : "noTrip";
        },
      ),
    (problem) => t(`problems.${problem}`),
  );
  return (
    <form
      id={formId}
      noValidate
      className="flex flex-col gap-4"
      onSubmit={onSubmit((input) => {
        copyNote.mutate(input, { onSuccess: setResult });
      })}
    >
      <TextField control={form.control} name="line" label={t("line")} hint={t("lineHint")} />
      <Controller
        control={form.control}
        name="packageIds"
        render={({ field, fieldState }) => (
          <FieldSet data-invalid={fieldState.error !== undefined}>
            <FieldLegend variant="label">{t("trips")}</FieldLegend>
            {others.map((trip) => (
              <Field key={trip.id} orientation="horizontal" className="min-h-11">
                <Checkbox
                  id={`${formId}-${trip.id}`}
                  checked={field.value.includes(trip.id)}
                  aria-describedby={fieldState.error === undefined ? undefined : problemId}
                  onCheckedChange={(next) => {
                    field.onChange(
                      next === true ? [...field.value, trip.id] : field.value.filter((id) => id !== trip.id),
                    );
                  }}
                />
                <FieldLabel htmlFor={`${formId}-${trip.id}`} className="font-normal">
                  {trip.name}
                </FieldLabel>
              </Field>
            ))}
            {fieldState.error?.message !== undefined && (
              <FieldProblem id={problemId}>{fieldState.error.message}</FieldProblem>
            )}
          </FieldSet>
        )}
      />
      <FormAlert sending={copyNote} problem={formProblem} />
      {result !== null && <Outcome result={result} trips={others} />}
    </form>
  );
}

export function CopyNoteDialog({ detail }: { detail: PackageDetail }) {
  const t = useTranslations("packages.copyNote");
  const access = useWriteAccess("change");
  const hintId = `${useId()}-write`;
  const opener = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  // What the last copy did stays in the dialog, since it names the trips skipped; a new opening forgets it.
  const [result, setResult] = useState<CopyNoteResult | null>(null);
  const { copyNote } = usePackageChanges();
  const trips = useQuotePackages();
  const others = trips.data?.filter((one) => one.id !== detail.id);
  return (
    <div>
      <Button
        ref={opener}
        variant="outline"
        disabled={!access.allowed}
        aria-describedby={access.allowed ? undefined : hintId}
        onClick={() => {
          setOpen(true);
        }}
      >
        {t("open")}
      </Button>
      <WriteHint id={hintId} hint={access.hint} />
      <FormDialog
        dialog={{
          open,
          setOpen: (next) => {
            if (!next) setResult(null);
            setOpen(next);
          },
        }}
        sending={copyNote}
        returnFocusTo={opener}
        title={t("title")}
        description={t("description")}
        submit={t("copy")}
        submitting={t("copying")}
        canSubmit={others !== undefined && others.length > 0}
      >
        {(formId) =>
          others === undefined ? (
            trips.isError ? (
              <LoadFailedAlert message={t("loadFailed")} error={trips.error} onRetry={() => void trips.refetch()} />
            ) : (
              <LoadingRows shape="twoLines" label={t("loading")} />
            )
          ) : others.length === 0 ? (
            <p className="text-muted-foreground">{t("none")}</p>
          ) : (
            <CopyNoteForm
              formId={formId}
              detail={detail}
              others={others}
              copyNote={copyNote}
              result={result}
              setResult={setResult}
            />
          )
        }
      </FormDialog>
    </div>
  );
}
