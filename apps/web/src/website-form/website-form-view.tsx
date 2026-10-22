"use client";

// The visitor's enquiry form (spec 3.5): one component for the hosted page, the embed and the settings Preview. It
// checks the answers with the api's own schema, keeps one submission id for every attempt, and shows a refusal in one
// alert above the button with what was typed kept (W41). What happens after a good send is the page's (thank-you.tsx).
import { CircleAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldSet } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { colourStyle } from "./colour-style";
import { FormFields } from "./form-fields";
import { FormHeader } from "./form-header";
import { emptyFormValues, toEnquiryInput, type FormProblem, type FormValues } from "./form-values";
import type { WebsiteFormViewProps } from "./form-props";
import { useRefusalSentence } from "./use-refusal-sentence";

/** How long a send may take before the visitor is asked to keep the page open (the pilot's api sleeps, W42). */
const STILL_SENDING_AFTER_MS = 15_000;

export function WebsiteFormView({ form, mode, width, send }: WebsiteFormViewProps) {
  const t = useTranslations("websiteForm.form");
  const sentence = useRefusalSentence();
  const headingId = useId();
  // Made once per load and sent with every attempt, so a retry or a double tap is one enquiry (W21).
  const [submissionId] = useState(() => crypto.randomUUID());
  const [sending, setSending] = useState(false);
  const [slow, setSlow] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const preview = mode === "preview";

  const {
    form: values,
    onSubmit,
    formProblem,
  } = useCheckedForm<FormValues, Parameters<typeof send>[0], FormProblem>(
    emptyFormValues(),
    (answers) => toEnquiryInput(answers, { form, submissionId, via: mode === "embedded" ? "embedded" : "hosted" }),
    (problem) => t(`problems.${problem}`),
  );

  useEffect(() => {
    if (!sending) return;
    const timer = setTimeout(() => {
      setSlow(true);
    }, STILL_SENDING_AFTER_MS);
    return () => {
      clearTimeout(timer);
      setSlow(false);
    };
  }, [sending]);

  const submit = onSubmit((body) => {
    setRefusal(null);
    setSending(true);
    void send(body)
      .catch((error: unknown) => {
        setRefusal(sentence(error));
      })
      .finally(() => {
        setSending(false);
      });
  });
  const problem = formProblem ?? refusal;

  return (
    <div
      data-slot="website-form"
      style={{ ...colourStyle(form.colour), ...(width === undefined ? {} : { width }) }}
      className="@container flex w-full max-w-[560px] flex-col gap-6"
    >
      <FormHeader
        form={form}
        headingId={headingId}
        heading={form.heading ?? t("defaultHeading", { name: form.organizationName })}
      />
      <form
        noValidate
        aria-labelledby={headingId}
        onSubmit={
          preview
            ? (event) => {
                event.preventDefault();
              }
            : submit
        }
      >
        <FieldSet disabled={sending} className="gap-6">
          <FormFields form={form} values={values} disabled={sending} />
          {/* The honeypot (W36): off screen, not display:none (some bots skip those), out of reach of people. */}
          <div aria-hidden="true" className="absolute -left-[9999px] size-px overflow-hidden">
            <input type="text" tabIndex={-1} autoComplete="off" {...values.register("homepage")} />
          </div>
          {problem !== null && (
            <Alert variant="destructive">
              <CircleAlertIcon aria-hidden="true" />
              <AlertDescription>{problem}</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-col gap-3">
            <Button type="submit" disabled={sending || preview} className="w-full @sm:w-auto @sm:self-start">
              {sending && <Spinner />}
              {sending ? t("sending") : t("send")}
            </Button>
            {slow && <p role="status">{t("stillSending")}</p>}
            <p className="text-caption text-muted-foreground">
              {t("goesTo", { name: form.organizationName })}
              {form.privacyUrl !== null && (
                <Button variant="link" className="h-auto px-1 py-0 text-caption" asChild>
                  <a href={form.privacyUrl} target="_blank" rel="noopener noreferrer">
                    {t("privacy")}
                  </a>
                </Button>
              )}
            </p>
            {preview && <p className="text-caption text-muted-foreground">{t("previewNote")}</p>}
          </div>
        </FieldSet>
      </form>
    </div>
  );
}
