"use client";

// The colour and terms form: the brand colour typed as #rrggbb or picked (the picker is its swatch), and the terms
// every document prints at its end. Checked by the api's own schema before it is sent; a blank box is no value.
import { brand } from "@travel-crm/brand";
import { saveBrandingInput, type BrandingDetails } from "@travel-crm/contracts/profile";
import { useTranslations } from "next-intl";
import { useForm, useWatch, type FieldErrors, type Resolver } from "react-hook-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useErrorMessage } from "@/lib/error-message";
import { useWriteAccess } from "@/subscription/write-access";
import { useSaveBranding } from "./use-branding";

interface BrandingValues {
  brandColour: string;
  documentTerms: string;
}

const HEX_COLOUR = /^#[0-9a-f]{6}$/i;

const valuesOf = (branding: BrandingDetails): BrandingValues => ({
  brandColour: branding.brandColour ?? "",
  documentTerms: branding.documentTerms ?? "",
});

export function BrandingDetailsForm({ saved }: { saved: BrandingDetails }) {
  const t = useTranslations("documents.branding.details");
  const { apiError } = useErrorMessage();
  const write = useWriteAccess();
  const save = useSaveBranding();
  const resolver: Resolver<BrandingValues> = (values) => {
    const checked = saveBrandingInput.safeParse(values);
    if (checked.success) return { values, errors: {} };
    const errors: FieldErrors<BrandingValues> = {};
    for (const issue of checked.error.issues) {
      if (issue.path[0] === "brandColour") errors.brandColour = { type: "validate", message: t("colourInvalid") };
      if (issue.path[0] === "documentTerms") errors.documentTerms = { type: "validate", message: t("termsTooLong") };
    }
    return { values: {}, errors };
  };
  const form = useForm<BrandingValues>({ resolver, defaultValues: valuesOf(saved) });
  const { errors } = form.formState;
  const colour = useWatch({ control: form.control, name: "brandColour" }).trim();
  // A colour input holds a colour at all times: the typed one when it is one, else the standard colour documents use.
  const swatch = HEX_COLOUR.test(colour) ? colour.toLowerCase() : brand.colours.action;

  const submit = form.handleSubmit((values) => {
    save.mutate(values, {
      onSuccess: (branding) => {
        form.reset(valuesOf(branding));
      },
    });
  });

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-6">
      <FieldGroup>
        <Field data-invalid={errors.brandColour !== undefined}>
          <FieldLabel htmlFor="brand-colour">{t("colour")}</FieldLabel>
          <div className="flex items-center gap-3">
            <Input
              type="color"
              aria-label={t("colourPicker")}
              value={swatch}
              className="w-11 shrink-0 cursor-pointer p-1"
              onChange={(event) => {
                form.setValue("brandColour", event.target.value, { shouldDirty: true, shouldValidate: true });
              }}
            />
            <Input
              id="brand-colour"
              className="numbers w-36"
              maxLength={7}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              aria-invalid={errors.brandColour !== undefined}
              {...form.register("brandColour")}
            />
          </div>
          <FieldDescription>{t("colourHint")}</FieldDescription>
          <FieldError errors={[errors.brandColour]} />
        </Field>
        <Field data-invalid={errors.documentTerms !== undefined}>
          <FieldLabel htmlFor="document-terms">{t("terms")}</FieldLabel>
          <Textarea
            id="document-terms"
            maxLength={2000}
            rows={4}
            className="script-leading"
            aria-invalid={errors.documentTerms !== undefined}
            {...form.register("documentTerms")}
          />
          <FieldDescription>{t("termsHint")}</FieldDescription>
          <FieldError errors={[errors.documentTerms]} />
        </Field>
      </FieldGroup>
      {save.isError && (
        <Alert variant="destructive">
          <AlertDescription>{apiError(save.error)}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col items-end gap-2">
        <Button type="submit" disabled={!write.allowed || save.isPending}>
          {save.isPending ? t("saving") : t("save")}
        </Button>
        {write.hint !== null && <p className="text-label text-muted-foreground">{write.hint}</p>}
      </div>
    </form>
  );
}
