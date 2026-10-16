"use client";

// The second step of a two-factor sign-in: the 6-digit code from the authenticator app, or a backup code. Better
// Auth remembers the first step in a short-lived cookie; if it has expired the person starts again. Switching between
// the two kinds of code puts the focus in the new field. Platform staff's device is never trusted, since they reach
// every organization: the api ignores the box for them (ADR 0025), its hint says so, and on the way to the console it
// isn't offered at all.
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useId, useState, type SubmitEvent } from "react";
import { PageTitle } from "@/components/page-title";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { authClient, type AuthClient } from "@/data/auth-client";
import { isConsolePath, routes } from "@/lib/routes";
import { AuthFailureAlert, type AuthFailure } from "./form-alert";
import { useFinishSignIn } from "./finish-sign-in";
import { nextPath } from "./next-path";
import { CODE_LENGTH, SixDigitCode } from "./six-digit-code";

export function TwoFactorChallenge({
  auth = authClient,
}: {
  auth?: Pick<AuthClient, "verifyTwoFactorCode" | "verifyBackupCode">;
}) {
  const t = useTranslations("account");
  const next = nextPath(useSearchParams());
  const offersTrust = !isConsolePath(next);
  const finishSignIn = useFinishSignIn();
  const id = useId();
  const [useBackup, setUseBackup] = useState(false);
  const [code, setCode] = useState("");
  const [trustDevice, setTrustDevice] = useState(false);
  const [failure, setFailure] = useState<AuthFailure | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const ready = useBackup ? code.trim().length > 0 : code.length === CODE_LENGTH;
  const expired =
    failure?.code === "INVALID_TWO_FACTOR_COOKIE" || failure?.code === "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE";

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ready) return;
    setSubmitting(true);
    setFailure(null);
    const input = { code: code.trim(), trustDevice: offersTrust && trustDevice };
    const result = useBackup ? await auth.verifyBackupCode(input) : await auth.verifyTwoFactorCode(input);
    if (result.ok) {
      await finishSignIn(next);
      return;
    }
    setFailure(result);
    setSubmitting(false);
  };

  return (
    <div className="flex flex-col gap-6">
      <PageTitle>{t("twoFactor.title")}</PageTitle>
      <p className="text-muted-foreground">{useBackup ? t("twoFactor.backupIntro") : t("twoFactor.intro")}</p>
      <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-5">
        <Field>
          <FieldLabel htmlFor={`${id}-code`}>{useBackup ? t("fields.backupCode") : t("fields.code")}</FieldLabel>
          {useBackup ? (
            <Input
              id={`${id}-code`}
              autoFocus
              value={code}
              onChange={(event) => {
                setCode(event.target.value);
              }}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              className="numbers"
            />
          ) : (
            <SixDigitCode id={`${id}-code`} value={code} onChange={setCode} autoFocus />
          )}
        </Field>
        {offersTrust && (
          <Field orientation="horizontal">
            <Checkbox
              id={`${id}-trust`}
              aria-describedby={`${id}-trust-hint`}
              checked={trustDevice}
              onCheckedChange={(checked) => {
                setTrustDevice(checked === true);
              }}
            />
            {/* Agencies share office PCs. On a trusted one, whoever learns this person's password needs no code. */}
            <FieldContent>
              <FieldLabel htmlFor={`${id}-trust`} className="font-normal">
                {t("twoFactor.trustDevice")}
              </FieldLabel>
              <FieldDescription id={`${id}-trust-hint`}>{t("twoFactor.trustDeviceHint")}</FieldDescription>
            </FieldContent>
          </Field>
        )}
        <AuthFailureAlert failure={failure} />
        {expired ? (
          <Button asChild>
            <Link href={`${routes.signIn}?next=${encodeURIComponent(next)}`}>{t("twoFactor.startAgain")}</Link>
          </Button>
        ) : (
          <Button type="submit" disabled={!ready || submitting}>
            {submitting && <Spinner />}
            {submitting ? t("twoFactor.submitting") : t("twoFactor.submit")}
          </Button>
        )}
      </form>
      <Button
        variant="ghost"
        className="self-start"
        onClick={() => {
          setUseBackup(!useBackup);
          setCode("");
          setFailure(null);
        }}
      >
        {useBackup ? t("twoFactor.useAuthenticator") : t("twoFactor.useBackupCode")}
      </Button>
    </div>
  );
}
