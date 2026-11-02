"use client";

// Make quotes from a package (release 7b): the tiers to quote (each becomes an option of the same enquiry) and the travel
// start date, which decides the season each rate is read from. A line with no rate for those dates comes out as "needs a rate"
// at zero, and that quote is not sent until a person prices it. A package with no tiers makes one quote from its saved lines.
import { useQuery } from "@tanstack/react-query";
import type { LeadDetail } from "@travel-crm/contracts/crm";
import { makeQuotesFromPackageInput, type MakeQuotesFromPackageInput } from "@travel-crm/contracts/quotes";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { DateField } from "@/components/date-field";
import { checked } from "@/components/forms/checked";
import { FormAlert, FormDialog, useFormDialog, type OpenState } from "@/components/forms/form-dialog";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import type { ReturnFocusTo } from "@/components/return-focus";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { useTRPC } from "@/data/trpc";
import { quoteRoute } from "@/lib/routes";
import { useMakeQuotes } from "@/packages/use-packages";

type Problem = "required" | "invalid";
interface Values {
  startDate: string;
}

function MakeForm({
  formId,
  lead,
  packageId,
  dialog,
  make,
}: {
  formId: string;
  lead: LeadDetail;
  packageId: string;
  dialog: { onSuccess: () => Promise<void> };
  make: ReturnType<typeof useMakeQuotes>;
}) {
  const t = useTranslations("quotes.makeFromPackage");
  const router = useRouter();
  const trpc = useTRPC();
  const choices = useQuery(trpc.packages.choices.queryOptions({ packageId }));
  // Every tier is chosen to begin with; the person unticks the ones this customer doesn't want.
  const [unticked, setUnticked] = useState<ReadonlySet<string>>(new Set());
  const tiers = choices.data?.tiers ?? [];
  const chosen = tiers.map((tier) => tier.id).filter((id) => !unticked.has(id));
  const startDate = lead.trip.when.kind === "dates" ? lead.trip.when.from : "";
  const { form, onSubmit, formProblem } = useCheckedForm<Values, MakeQuotesFromPackageInput, Problem>(
    { startDate },
    (typed) =>
      checked(
        makeQuotesFromPackageInput.safeParse({
          leadId: lead.id,
          packageId,
          tierIds: chosen,
          startDate: typed.startDate === "" ? null : typed.startDate,
        }),
        typed,
        (path) => (path[0] === "startDate" ? "startDate" : undefined),
        () => "invalid",
      ),
    () => t("problem"),
  );
  return (
    <form
      id={formId}
      noValidate
      className="flex flex-col gap-4"
      onSubmit={onSubmit((input) => {
        make.mutate(input, {
          onSuccess: ({ quotes }) => {
            void dialog.onSuccess().then(() => {
              const first = quotes[0];
              if (first !== undefined) router.push(quoteRoute(first.id));
            });
          },
        });
      })}
    >
      {tiers.length > 0 && (
        <FieldSet>
          <FieldLegend variant="label">{t("tiers")}</FieldLegend>
          {tiers.map((tier) => (
            <Field key={tier.id} orientation="horizontal">
              <Checkbox
                id={`${formId}-${tier.id}`}
                checked={!unticked.has(tier.id)}
                onCheckedChange={(next) => {
                  const copy = new Set(unticked);
                  if (next === true) copy.delete(tier.id);
                  else copy.add(tier.id);
                  setUnticked(copy);
                }}
              />
              <FieldLabel htmlFor={`${formId}-${tier.id}`} className="font-normal">
                {tier.name}
              </FieldLabel>
            </Field>
          ))}
        </FieldSet>
      )}
      <DateField control={form.control} name="startDate" label={t("startDate")} hint={t("startDateHint")} />
      <FormAlert sending={make} problem={formProblem} />
    </form>
  );
}

export function MakeQuotesDialog({
  lead,
  packageId,
  packageName,
  open,
  onOpenChange,
  returnFocusTo,
}: {
  lead: LeadDetail;
  packageId: string;
  packageName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusTo: ReturnFocusTo;
}) {
  const t = useTranslations("quotes.makeFromPackage");
  const held: OpenState = { open, setOpen: onOpenChange };
  const dialog = useFormDialog(t("made"), () => Promise.resolve(), held);
  const make = useMakeQuotes();
  return (
    <FormDialog
      dialog={dialog}
      sending={make}
      title={t("title", { name: packageName })}
      description={t("description")}
      submit={t("submit")}
      submitting={t("submitting")}
      returnFocusTo={returnFocusTo}
    >
      {(formId) => <MakeForm formId={formId} lead={lead} packageId={packageId} dialog={dialog} make={make} />}
    </FormDialog>
  );
}
