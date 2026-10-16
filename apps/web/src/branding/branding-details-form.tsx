"use client";

// The colour and terms form: the brand colour typed as #rrggbb or picked (the picker is its swatch), and the terms
// every document prints at its end. Checked by the api's own schema before it is sent; a blank box is no value. A newer
// branding (saved in another tab, then refreshed) updates a box not being changed and keeps what is being typed.
import { brand } from "@travel-crm/brand";
import { saveBrandingInput, type BrandingDetails } from "@travel-crm/contracts/profile";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { useForm, useWatch, type FieldErrors, type Resolver } from "react-hook-form";
import { FormField } from "@/components/form-field";
import { RefusalAlert } from "@/components/refusal-alert";
import { Button } from "@/components/ui/button";
import { FieldDescription, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  const write = useWriteAccess();
  const hintId = useId();
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
  const form = useForm<BrandingValues>({
    resolver,
    values: valuesOf(saved),
    resetOptions: { keepDirtyValues: true },
  });
  const { errors } = form.formState;
  const colour = useWatch({ control: form.control, name: "brandColour" }).trim();
  // A colour input holds a colour at all times: the typed one when it is one, else the standard colour documents use.
  const swatch = HEX_COLOUR.test(colour) ? colour.toLowerCase() : brand.colours.action;

  const submit = form.handleSubmit((values) => {
    save.mutate(values, {
      onSuccess: (branding) => {
        form.reset(valuesOf(branding), { keepDirtyValues: false });
      },
    });
  });

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-6">
      <FieldGroup>
        <FormField label={t("colour")} hint={t("colourHint")} error={errors.brandColour?.message}>
          {(links) => (
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
                {...links}
                className="numbers w-36"
                maxLength={7}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                {...form.register("brandColour")}
              />
            </div>
          )}
        </FormField>
        <FormField label={t("terms")} hint={t("termsHint")} error={errors.documentTerms?.message}>
          {(links) => (
            <Textarea
              {...links}
              maxLength={2000}
              rows={4}
              className="script-leading"
              {...form.register("documentTerms")}
            />
          )}
        </FormField>
      </FieldGroup>
      <RefusalAlert error={save.error} />
      <div className="flex flex-col items-end gap-2">
        <Button
          type="submit"
          disabled={!write.allowed || save.isPending}
          aria-describedby={write.hint === null ? undefined : hintId}
        >
          {save.isPending ? t("saving") : t("save")}
        </Button>
        {write.hint !== null && <FieldDescription id={hintId}>{write.hint}</FieldDescription>}
      </div>
    </form>
  );
}
