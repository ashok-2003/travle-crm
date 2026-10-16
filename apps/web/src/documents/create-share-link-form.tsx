"use client";

// A new link to the document: a label for staff (who it is for) and its expiry, the default 30 days or never. The
// label is checked by the api's own rule before it is sent; a refusal shows above the button.
import type { IssuedDocumentSummary } from "@travel-crm/contracts/documents";
import { shareLinkLabel } from "@travel-crm/contracts/share-links";
import { useTranslations } from "next-intl";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useErrorMessage } from "@/lib/error-message";
import { useWriteAccess } from "@/subscription/write-access";
import { sharedDocument, type useCreateShareLink } from "./use-share-links";

interface ShareLinkValues {
  label: string;
  /** "default": the api's 30 days. */
  expiry: "default" | "never";
}

export function CreateShareLinkForm({
  document,
  create,
}: {
  document: IssuedDocumentSummary;
  /** The create call, owned by the dialog so that it can let go of the token when it closes. */
  create: ReturnType<typeof useCreateShareLink>;
}) {
  const t = useTranslations("documents.share");
  const { apiError } = useErrorMessage();
  const write = useWriteAccess();
  const resolver: Resolver<ShareLinkValues> = (values) =>
    shareLinkLabel.safeParse(values.label).success
      ? { values, errors: {} }
      : { values: {}, errors: { label: { type: "validate", message: t("labelInvalid") } } };
  const form = useForm<ShareLinkValues>({
    resolver,
    defaultValues: { label: `${document.title} ${document.number}`, expiry: "default" },
  });
  const { errors } = form.formState;

  const submit = form.handleSubmit((values) => {
    create.mutate({
      ...sharedDocument(document.id),
      label: values.label,
      ...(values.expiry === "never" ? { expiresAt: null } : {}),
    });
  });

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
      <h3 className="font-semibold">{t("newLink")}</h3>
      <FieldGroup>
        <Field data-invalid={errors.label !== undefined}>
          <FieldLabel htmlFor={`share-label-${document.id}`}>{t("label")}</FieldLabel>
          <Input
            id={`share-label-${document.id}`}
            maxLength={200}
            autoComplete="off"
            className="script-leading"
            aria-invalid={errors.label !== undefined}
            {...form.register("label")}
          />
          <FieldDescription>{t("labelHint")}</FieldDescription>
          <FieldError errors={[errors.label]} />
        </Field>
        <Field>
          <FieldLabel id={`share-expiry-${document.id}`}>{t("expiry")}</FieldLabel>
          <Controller
            control={form.control}
            name="expiry"
            render={({ field }) => (
              <RadioGroup
                aria-labelledby={`share-expiry-${document.id}`}
                value={field.value}
                onValueChange={field.onChange}
                className="flex flex-wrap gap-6"
              >
                {(["default", "never"] as const).map((expiry) => (
                  <div key={expiry} className="flex min-h-11 items-center gap-3">
                    <RadioGroupItem value={expiry} id={`share-expiry-${document.id}-${expiry}`} />
                    <FieldLabel htmlFor={`share-expiry-${document.id}-${expiry}`} className="font-normal">
                      {expiry === "default" ? t("expiryDefault") : t("expiryNever")}
                    </FieldLabel>
                  </div>
                ))}
              </RadioGroup>
            )}
          />
        </Field>
      </FieldGroup>
      {create.isError && (
        <Alert variant="destructive">
          <AlertDescription>{apiError(create.error)}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col items-end gap-2">
        <Button type="submit" disabled={!write.allowed || create.isPending}>
          {create.isPending ? t("creating") : t("create")}
        </Button>
        {write.hint !== null && <p className="text-label text-muted-foreground">{write.hint}</p>}
      </div>
    </form>
  );
}
