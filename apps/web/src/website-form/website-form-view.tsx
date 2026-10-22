"use client";

// The visitor's enquiry form (spec 3.5): one component for the hosted page, the embed and the settings Preview. It
// checks the answers with the api's own schema, keeps one submission id for every attempt, and shows a refusal in one
// alert above the button with what was typed kept (W41). What happens after a good send is the page's (thank-you.tsx).
import { CircleAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { lazy, Suspense, useEffect, useId, useState } from "react";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { TextLink } from "@/components/text-link";
import { Button } from "@/components/ui/button";
import { FieldSet } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { colourStyle } from "./colour-style";
import { FormFields } from "./form-fields";
import { FormHeader } from "./form-header";
import { emptyFormValues, toEnquiryInput, type FormProblem, type FormValues } from "./form-values";
import type { WebsiteFormViewProps } from "./form-props";
import { sampleFormValues } from "./sample-values";
import { FormRefusal } from "./refusal";
import { SEND_RETRY_DELAY_MS, sleep } from "./send-enquiry";
import { useRefusalSentence } from "./use-refusal-sentence";
import { useTokenWaiter } from "./use-token-waiter";

// Only a form whose server has Turnstile keys loads the widget, and so its code.
const TurnstileWidget = lazy(() =>
  import("./turnstile-widget").then((module) => ({ default: module.TurnstileWidget })),
);

/**
 * Whether a refused send used up the Turnstile token: the bot check is step 6 of the api's order (spec 6.1), so a refusal
 * from an earlier step (too fast, links, a closed form, too many tries) leaves it good. A fault or no answer may have come
 * after it.
 */
function spentTheToken(error: unknown): boolean {
  if (!(error instanceof FormRefusal)) return true;
  return error.reason === "FORM_BOT_CHECK_FAILED" || error.status === 0 || error.status >= 500;
}

/** How long a resend waits for the widget's new token before giving up with the original failure. */
const NEW_TOKEN_WAIT_MS = 15_000;

/** A send nobody answered, or the api's fault: worth one more try. */
function isUnanswered(error: unknown): boolean {
  return error instanceof FormRefusal && (error.status === 0 || error.status >= 500);
}

/** How long a send may take before the visitor is asked to keep the page open (the pilot's api sleeps, W42). */
const STILL_SENDING_AFTER_MS = 15_000;

export function WebsiteFormView({ form, mode, width, sample = false, send }: WebsiteFormViewProps) {
  const t = useTranslations("websiteForm.form");
  const tErrors = useTranslations("errors");
  const sentence = useRefusalSentence();
  const headingId = useId();
  // Made once per load and sent with every attempt, so a retry or a double tap is one enquiry (W21).
  const [submissionId] = useState(() => crypto.randomUUID());
  const [sending, setSending] = useState(false);
  const [slow, setSlow] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const preview = mode === "preview";
  // Turnstile (W39): a token works once, so every refused send asks for a new one.
  const [token, setToken] = useState<string | null>(null);
  const [checkFailed, setCheckFailed] = useState(false);
  const [newCheck, setNewCheck] = useState(0);
  const [widgetAttempt, setWidgetAttempt] = useState(0);
  const checking = form.turnstileSiteKey !== null && !preview;
  const waitingForCheck = checking && token === null;

  const {
    form: values,
    onSubmit,
    formProblem,
  } = useCheckedForm<FormValues, Parameters<typeof send>[0], FormProblem>(
    sample ? sampleFormValues(form) : emptyFormValues(),
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

  const tokens = useTokenWaiter(
    setToken,
    () => {
      setNewCheck((count) => count + 1);
    },
    NEW_TOKEN_WAIT_MS,
  );

  /**
   * Sends once; if nothing answered or the api faulted (it may be waking, W42), once more after a short wait with the same
   * body and so the same submission id. A token is verified once, so the resend takes a new one first (W39).
   */
  async function deliver(body: Parameters<typeof send>[0]): Promise<void> {
    try {
      await send(token === null ? body : { ...body, turnstileToken: token });
    } catch (error) {
      if (!isUnanswered(error)) throw error;
      const [fresh] = await Promise.all([
        checking ? tokens.next().catch(() => null) : null,
        sleep(SEND_RETRY_DELAY_MS),
      ]);
      if (checking && fresh === null) throw error;
      await send(fresh === null ? body : { ...body, turnstileToken: fresh });
    }
  }

  const submit = onSubmit((body) => {
    setRefusal(null);
    setSending(true);
    void deliver(body)
      .catch((error: unknown) => {
        setRefusal(sentence(error));
        if (checking && spentTheToken(error)) {
          setToken(null);
          setNewCheck((count) => count + 1);
        }
      })
      .finally(() => {
        setSending(false);
      });
  });
  const problem = formProblem ?? refusal;

  return (
    <div
      data-slot="website-form"
      style={width === undefined ? undefined : { width, maxWidth: "100%" }}
      className="@container flex w-full max-w-[560px] flex-col gap-6"
    >
      {/* The agency's colour is set here, on the form's own parts. The links below sit outside it: a pale colour reads on a
          button with dark ink but not as the colour of text on the page. */}
      <div data-slot="website-form-colour" style={colourStyle(form.colour)} className="flex flex-col gap-6">
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
            {checking && form.turnstileSiteKey !== null && (
              <Suspense fallback={null}>
                <TurnstileWidget
                  key={widgetAttempt}
                  siteKey={form.turnstileSiteKey}
                  resetKey={newCheck}
                  onToken={tokens.arrived}
                  onUnavailable={() => {
                    setCheckFailed(true);
                  }}
                />
              </Suspense>
            )}
            <div className="flex flex-col gap-3">
              <Button
                type="submit"
                disabled={sending || preview || waitingForCheck}
                className="w-full @sm:w-auto @sm:self-start"
              >
                {sending && <Spinner />}
                {sending ? t("sending") : t("send")}
              </Button>
              {slow && <p role="status">{t("stillSending")}</p>}
              {checkFailed && (
                <div role="alert" className="flex flex-col items-start gap-2">
                  <p>{tErrors("reasons.FORM_BOT_CHECK_FAILED")}</p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setCheckFailed(false);
                      setWidgetAttempt((count) => count + 1);
                    }}
                  >
                    {t("tryAgain")}
                  </Button>
                </div>
              )}
              {waitingForCheck && !checkFailed && !sending && (
                <p role="status" className="text-caption text-muted-foreground">
                  {t("checking")}
                </p>
              )}
            </div>
          </FieldSet>
        </form>
      </div>
      <div className="flex flex-col gap-3">
        <p className="text-caption text-muted-foreground">{t("goesTo", { name: form.organizationName })}</p>
        {form.privacyUrl !== null && (
          <TextLink href={form.privacyUrl} newTab>
            {t("privacy")}
          </TextLink>
        )}
        {preview && <p className="text-caption text-muted-foreground">{t("previewNote")}</p>}
      </div>
    </div>
  );
}
