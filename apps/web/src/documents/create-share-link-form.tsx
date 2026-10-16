"use client";

// A new link to the document: a label for staff (who it is for) and its expiry, the default 30 days or never. The
// label is checked by the api's own rule before it is sent; a refusal shows under the fields. The form is sent from the
// dialog's footer (ShareLinksDialog), whose button the write hint here describes.
import type { IssuedDocumentSummary } from "@travel-crm/contracts/documents";
import { shareLinkLabel } from "@travel-crm/contracts/share-links";
import { useTranslations } from "next-intl";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { FormField } from "@/components/form-field";
import { RefusalAlert } from "@/components/refusal-alert";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useWriteAccess } from "@/subscription/write-access";
import { sharedDocument, type useCreateShareLink } from "./use-share-links";

interface ShareLinkValues {
  label: string;
  /** "default": the api's 30 days. */
  expiry: "default" | "never";
}

/** The id of the write hint the footer's button names as its description. */
export const writeHintOf = (formId: string) => `${formId}-hint`;

export function CreateShareLinkForm({
  formId,
  document,
  create,
}: {
  /** The form's id, which the footer's submit button names. */
  formId: string;
  document: IssuedDocumentSummary;
  /** The create call, owned by the dialog so that it can let go of the token when it closes. */
  create: ReturnType<typeof useCreateShareLink>;
}) {
  const t = useTranslations("documents.share");
  const write = useWriteAccess();
  const resolver: Resolver<ShareLinkValues> = (values) =>
    shareLinkLabel.safeParse(values.label).success
      ? { values, errors: {} }
      : { values: {}, errors: { label: { type: "validate", message: t("labelInvalid") } } };
  const form = useForm<ShareLinkValues>({
    resolver,
    defaultValues: { label: `${document.title} ${document.number}`, expiry: "default" },
  });

  const submit = form.handleSubmit((values) => {
    create.mutate({
      ...sharedDocument(document.id),
      label: values.label,
      ...(values.expiry === "never" ? { expiresAt: null } : {}),
    });
  });

  return (
    <form id={formId} noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
      <h3 className="font-semibold">{t("newLink")}</h3>
      <FieldGroup>
        <FormField label={t("label")} hint={t("labelHint")} error={form.formState.errors.label?.message}>
          {(links) => (
            <Input
              {...links}
              maxLength={200}
              autoComplete="off"
              className="script-leading"
              {...form.register("label")}
            />
          )}
        </FormField>
        <Field>
          <FieldLabel id={`${formId}-expiry`}>{t("expiry")}</FieldLabel>
          <Controller
            control={form.control}
            name="expiry"
            render={({ field }) => (
              <RadioGroup
                aria-labelledby={`${formId}-expiry`}
                value={field.value}
                onValueChange={field.onChange}
                className="flex flex-wrap gap-6"
              >
                {(["default", "never"] as const).map((expiry) => (
                  <div key={expiry} className="flex min-h-11 items-center gap-3">
                    <RadioGroupItem value={expiry} id={`${formId}-expiry-${expiry}`} />
                    <FieldLabel htmlFor={`${formId}-expiry-${expiry}`} className="font-normal">
                      {expiry === "default" ? t("expiryDefault") : t("expiryNever")}
                    </FieldLabel>
                  </div>
                ))}
              </RadioGroup>
            )}
          />
        </Field>
      </FieldGroup>
      <RefusalAlert error={create.error} />
      {write.hint !== null && <FieldDescription id={writeHintOf(formId)}>{write.hint}</FieldDescription>}
    </form>
  );
}
