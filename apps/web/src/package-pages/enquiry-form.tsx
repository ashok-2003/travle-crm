"use client";

// The enquiry form on a package page (release 7b): name and phone, email if wanted, the month or the seats, a message. It checks
// the answers with the api's own schema, keeps one submission id for every attempt, and shows a refusal in one alert above the
// button with what was typed kept. What follows a good send is a thank-you in its place.
import { packageEnquiryInput, type PublicDeparture, type PublicEnquiryForm } from "@travel-crm/contracts/package-pages";
import { CircleAlertIcon, CircleCheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { lazy, Suspense, useState } from "react";
import { checked } from "@/components/forms/checked";
import { PhoneField } from "@/components/forms/phone-field";
import { SelectField } from "@/components/forms/select-field";
import { TextField } from "@/components/forms/text-field";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldSet } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { NoteField } from "@/leads/form/note-field";
import { FormRefusal } from "@/website-form/refusal";
import { SEND_RETRY_DELAY_MS, sleep } from "@/website-form/send-enquiry";
import { useRefusalSentence } from "@/website-form/use-refusal-sentence";
import { useTokenWaiter } from "@/website-form/use-token-waiter";
import { postPackageEnquiry } from "./send-package-enquiry";

// Only a server with Turnstile keys loads the widget, and so its code.
const TurnstileWidget = lazy(() =>
  import("@/website-form/turnstile-widget").then((module) => ({ default: module.TurnstileWidget })),
);

const FLEXIBLE = "flexible";
const NOT_SURE = "unsure";
const MAX_MESSAGE = 1000;
const NEW_TOKEN_WAIT_MS = 15_000;
const STILL_SENDING_AFTER_MS = 15_000;
const monthName = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });

type Problem = "required" | "name" | "phone" | "email" | "travellers" | "message";
interface Values {
  name: string;
  phone: string;
  email: string;
  /** "" until chosen, a month "2026-12", FLEXIBLE or NOT_SURE. */
  travelMonth: string;
  travellers: string;
  message: string;
  /** The honeypot: a person never fills it. */
  homepage: string;
}

/** Whether a refused send used up the Turnstile token (an earlier step's refusal leaves it good). */
function spentTheToken(error: unknown): boolean {
  if (!(error instanceof FormRefusal)) return true;
  return error.reason === "FORM_BOT_CHECK_FAILED" || error.status === 0 || error.status >= 500;
}

const isUnanswered = (error: unknown) => error instanceof FormRefusal && (error.status === 0 || error.status >= 500);

export function EnquiryForm({
  code,
  slug,
  agencyName,
  form: shown,
  departure,
  onWithoutDate,
}: {
  code: string;
  slug: string;
  agencyName: string;
  form: PublicEnquiryForm;
  departure: PublicDeparture | null;
  onWithoutDate: () => void;
}) {
  const t = useTranslations("packagePages.form");
  const tErrors = useTranslations("errors");
  const sentence = useRefusalSentence();
  // Made once per load and sent with every attempt, so a retry or a double tap is one enquiry.
  const [submissionId] = useState(() => crypto.randomUUID());
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [checkFailed, setCheckFailed] = useState(false);
  const [newCheck, setNewCheck] = useState(0);
  const [widgetAttempt, setWidgetAttempt] = useState(0);
  const checking = shown.turnstileSiteKey !== null;
  const waitingForCheck = checking && token === null;
  const joining = departure !== null;

  const { form, onSubmit, formProblem } = useCheckedForm<Values, ReturnType<typeof packageEnquiryInput.parse>, Problem>(
    { name: "", phone: "", email: "", travelMonth: "", travellers: "2", message: "", homepage: "" },
    (typed) => {
      const travellers = /^\d{1,2}$/.test(typed.travellers.trim()) ? Number(typed.travellers.trim()) : Number.NaN;
      return checked(
        packageEnquiryInput.safeParse({
          submissionId,
          openedToken: shown.openedToken,
          homepage: typed.homepage,
          ...(departure === null ? {} : { departureId: departure.id }),
          answers: {
            name: typed.name,
            phone: typed.phone,
            ...(typed.email.trim() === "" ? {} : { email: typed.email.trim() }),
            ...(departure !== null || typed.travelMonth === ""
              ? {}
              : { travelMonth: typed.travelMonth === NOT_SURE ? null : typed.travelMonth }),
            travellers,
            ...(typed.message.trim() === "" ? {} : { message: typed.message }),
          },
        }),
        typed,
        (path) => {
          const [part, key] = path.map(String);
          if (part === "homepage") return "homepage";
          return part === "answers" && (key === "name" || key === "phone" || key === "email" || key === "message")
            ? key
            : key === "travellers"
              ? "travellers"
              : key === "travelMonth"
                ? "travelMonth"
                : undefined;
        },
        (field) => (field === "travelMonth" ? "required" : (field as Problem)),
      );
    },
    (problem) => t(`problems.${problem}`),
  );

  const tokens = useTokenWaiter(
    setToken,
    () => {
      setNewCheck((count) => count + 1);
    },
    NEW_TOKEN_WAIT_MS,
  );
  const [slow, setSlow] = useState(false);

  const send = (body: unknown) => postPackageEnquiry(code, slug, body);

  /** Sends once; if nothing answered or the api faulted, once more after a short wait with the same body and a new token. */
  async function deliver(body: Record<string, unknown>): Promise<void> {
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
    const timer = setTimeout(() => {
      setSlow(true);
    }, STILL_SENDING_AFTER_MS);
    void deliver(body)
      .then(() => {
        setSent(true);
      })
      .catch((error: unknown) => {
        setRefusal(sentence(error));
        if (checking && spentTheToken(error)) {
          setToken(null);
          setNewCheck((count) => count + 1);
        }
      })
      .finally(() => {
        clearTimeout(timer);
        setSlow(false);
        setSending(false);
      });
  });
  const problem = formProblem ?? refusal;

  if (sent) {
    return (
      <div role="status" className="flex flex-col items-center gap-3 py-6 text-center">
        <CircleCheckIcon aria-hidden="true" className="size-10 text-status-good-ink" strokeWidth={1.25} />
        <p className="text-section font-semibold">{t("thanks")}</p>
        <p className="max-w-[40ch] [overflow-wrap:anywhere]">{t("thanksBody", { agency: agencyName })}</p>
      </div>
    );
  }
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4" aria-labelledby="enquire-heading">
      <p className="text-muted-foreground">
        {departure === null ? t("intro") : departure.word === "full" ? t("introWaitlist") : t("introJoin")}
      </p>
      <FieldSet disabled={sending} className="gap-4">
        <TextField control={form.control} name="name" label={t("name")} autoComplete="name" />
        <PhoneField control={form.control} name="phone" label={t("phone")} autoComplete="tel-national" />
        <TextField control={form.control} name="email" label={t("email")} type="email" autoComplete="email" />
        {joining ? (
          <TextField
            control={form.control}
            name="travellers"
            label={t("seats")}
            inputMode="numeric"
            className="numbers"
          />
        ) : (
          <>
            <SelectField
              control={form.control}
              name="travelMonth"
              label={t("month")}
              placeholder={t("chooseMonth")}
              disabled={sending}
              options={[
                ...shown.months.map((month) => ({
                  value: month,
                  label: monthName.format(new Date(`${month}-01T00:00:00Z`)),
                })),
                { value: FLEXIBLE, label: t("flexible") },
                { value: NOT_SURE, label: t("unsure") },
              ]}
            />
            <TextField
              control={form.control}
              name="travellers"
              label={t("travellers")}
              inputMode="numeric"
              className="numbers"
            />
          </>
        )}
        <NoteField
          control={form.control}
          name="message"
          label={t("message")}
          hint={t("messageCount", { count: form.watch("message").length, max: MAX_MESSAGE })}
          disabled={sending}
        />
        {/* The honeypot: off screen, not display:none (some bots skip those), out of reach of people. */}
        <div aria-hidden="true" className="absolute -left-[9999px] size-px overflow-hidden">
          <input type="text" tabIndex={-1} autoComplete="off" {...form.register("homepage")} />
        </div>
        {problem !== null && (
          <Alert variant="destructive">
            <CircleAlertIcon aria-hidden="true" />
            <AlertDescription>{problem}</AlertDescription>
          </Alert>
        )}
        {checking && shown.turnstileSiteKey !== null && (
          <Suspense fallback={null}>
            <TurnstileWidget
              key={widgetAttempt}
              siteKey={shown.turnstileSiteKey}
              resetKey={newCheck}
              onToken={tokens.arrived}
              onUnavailable={() => {
                setCheckFailed(true);
              }}
            />
          </Suspense>
        )}
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={sending || waitingForCheck}>
              {sending && <Spinner />}
              {sending
                ? t("sending")
                : departure === null
                  ? t("send")
                  : departure.word === "full"
                    ? t("sendWaitlist")
                    : t("sendJoin")}
            </Button>
            {departure !== null && (
              <Button type="button" variant="outline" disabled={sending} onClick={onWithoutDate}>
                {t("chooseAnother")}
              </Button>
            )}
          </div>
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
          <p className="text-caption text-muted-foreground">{shown.consentLine}</p>
        </div>
      </FieldSet>
    </form>
  );
}
