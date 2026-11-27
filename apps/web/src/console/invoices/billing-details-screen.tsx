"use client";

// The firm's billing details (a super admin's): who sends the invoices, how to pay, the default terms and the number
// prefixes, entered once on a form card. An invoice keeps the details it was made with, so saving changes new ones only.
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { BillingDetails } from "@travel-crm/contracts/platform";
import { ErrorState } from "@/components/error-state";
import { FormAlert } from "@/components/forms/form-dialog";
import { GstStateField } from "@/components/forms/gst-state-field";
import { TextField } from "@/components/forms/text-field";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { BackLink } from "@/components/text-link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FieldDescription, FieldGroup, FieldLegend, FieldSet } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { NoteField } from "@/leads/form/note-field";
import { BillingImageField } from "./billing-image-field";
import { consoleRoutes } from "../routes";
import { isSuperAdmin, useStaff } from "../session/staff-context";
import {
  billingDetailsValues,
  toSetBillingDetailsInput,
  type BillingDetailsProblem,
  type BillingDetailsValues,
} from "./billing-details-values";
import { useBillingDetails, useSetBillingDetails } from "./use-invoices";
import type { SetBillingDetailsInput } from "@travel-crm/contracts/platform";

function BillingDetailsForm({ saved }: { saved: BillingDetails | null }) {
  const t = useTranslations("consoleInvoices.billingDetails");
  const save = useSetBillingDetails(() => {
    toast.success(t("saved"));
  });
  const { form, onSubmit, formProblem } = useCheckedForm<
    BillingDetailsValues,
    SetBillingDetailsInput,
    BillingDetailsProblem
  >(billingDetailsValues(saved), toSetBillingDetailsInput, (problem) => t(`problems.${problem}`));
  const { control } = form;
  return (
    <Card>
      <CardContent>
        <form noValidate onSubmit={onSubmit(save.mutate)} className="flex flex-col gap-6">
          <FieldGroup>
            <FieldSet>
              <FieldLegend variant="label">{t("firmLegend")}</FieldLegend>
              <TextField control={control} name="legalName" label={t("legalName")} autoComplete="off" />
              <NoteField control={control} name="address" label={t("address")} rows={3} />
              <GstStateField
                control={control}
                name="stateCode"
                label={t("stateCode")}
                placeholder={t("statePlaceholder")}
              />
              <div className="grid gap-5 sm:grid-cols-2">
                <TextField
                  control={control}
                  name="pan"
                  label={t("pan")}
                  autoComplete="off"
                  className="[&_input]:numbers"
                />
                <TextField
                  control={control}
                  name="gstin"
                  label={t("gstin")}
                  hint={t("gstinHint")}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  className="[&_input]:numbers"
                />
                <TextField control={control} name="phone" label={t("phone")} type="tel" autoComplete="off" />
                <TextField control={control} name="email" label={t("email")} type="email" autoComplete="off" />
              </div>
            </FieldSet>
            <FieldSet>
              <FieldLegend variant="label">{t("paymentLegend")}</FieldLegend>
              <div className="grid gap-5 sm:grid-cols-2">
                <TextField control={control} name="bankAccountName" label={t("bankAccountName")} autoComplete="off" />
                <TextField
                  control={control}
                  name="bankAccountNumber"
                  label={t("bankAccountNumber")}
                  autoComplete="off"
                  className="[&_input]:numbers"
                />
                <TextField
                  control={control}
                  name="bankIfsc"
                  label={t("bankIfsc")}
                  autoComplete="off"
                  className="[&_input]:numbers"
                />
                <TextField control={control} name="bankNameBranch" label={t("bankNameBranch")} autoComplete="off" />
                <TextField control={control} name="upiId" label={t("upiId")} autoComplete="off" />
              </div>
            </FieldSet>
            <FieldSet>
              <FieldLegend variant="label">{t("signLegend")}</FieldLegend>
              <FieldDescription>{t("signIntro")}</FieldDescription>
              <div className="grid gap-5 sm:grid-cols-2">
                <BillingImageField control={control} name="logoKey" kind="logo" savedKey={saved?.logoKey ?? ""} />
                <BillingImageField
                  control={control}
                  name="signatureKey"
                  kind="signature"
                  savedKey={saved?.signatureKey ?? ""}
                />
                <TextField control={control} name="signatoryName" label={t("signatoryName")} autoComplete="off" />
                <TextField
                  control={control}
                  name="signatoryTitle"
                  label={t("signatoryTitle")}
                  hint={t("signatoryTitleHint")}
                  autoComplete="off"
                />
              </div>
            </FieldSet>
            <FieldSet>
              <FieldLegend variant="label">{t("invoicesLegend")}</FieldLegend>
              <NoteField
                control={control}
                name="defaultTerms"
                label={t("defaultTerms")}
                hint={t("defaultTermsHint")}
                rows={4}
              />
              <FieldDescription>{t("prefixHint")}</FieldDescription>
              <div className="grid gap-5 sm:grid-cols-2">
                <TextField
                  control={control}
                  name="proformaPrefix"
                  label={t("proformaPrefix")}
                  autoComplete="off"
                  autoCapitalize="characters"
                />
                <TextField
                  control={control}
                  name="invoicePrefix"
                  label={t("invoicePrefix")}
                  autoComplete="off"
                  autoCapitalize="characters"
                />
              </div>
            </FieldSet>
          </FieldGroup>
          <FormAlert sending={save} problem={formProblem} />
          <Button type="submit" className="self-start" disabled={save.isPending}>
            {save.isPending && <Spinner />}
            {save.isPending ? t("saving") : t("save")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function Details() {
  const t = useTranslations("consoleInvoices.billingDetails");
  const tCommon = useTranslations("common");
  const details = useBillingDetails();
  if (!details.isSuccess) {
    return details.isError ? (
      <ErrorState
        message={t("loadFailed")}
        error={details.error}
        retryLabel={tCommon("tryAgain")}
        onRetry={() => void details.refetch()}
      />
    ) : (
      <LoadingRows rows={3} label={t("loading")} />
    );
  }
  // Keyed by what is saved, so a save shows the details as the api stored them.
  return <BillingDetailsForm key={JSON.stringify(details.data)} saved={details.data} />;
}

export function BillingDetailsScreen() {
  const t = useTranslations("consoleInvoices.billingDetails");
  const superAdmin = isSuperAdmin(useStaff());
  return (
    <div className="flex flex-col gap-6">
      <BackLink href={consoleRoutes.invoices} label={t("back")} />
      <PageHeader title={t("title")} intro={t("intro")} />
      {superAdmin ? <Details /> : <p>{t("superAdminsOnly")}</p>}
    </div>
  );
}
