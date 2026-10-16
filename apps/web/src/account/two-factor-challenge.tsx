"use client";

// The second step of a two-factor sign-in: the 6-digit code from the authenticator app, or a backup code. Better
// Auth remembers the first step in a short-lived cookie; if it has expired the person starts again. Switching between
// the two kinds of code puts the focus in the new field. Platform staff's device is never trusted, since they reach
// every organization: the api ignores the box for them (ADR 0025), and on the way to the console it isn't offered at
// all.
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useId, useState, type SubmitEvent } from "react";
import { FormField } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
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
  // The button stays live like every account form's; pressing it with the code missing says so.
  const [missing, setMissing] = useState(false);
  const expired =
    failure?.code === "INVALID_TWO_FACTOR_COOKIE" || failure?.code === "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE";

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMissing(!ready);
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
      <PageHeader title={t("twoFactor.title")} intro={useBackup ? t("twoFactor.backupIntro") : t("twoFactor.intro")} />
      <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-5">
        <FormField
          label={useBackup ? t("fields.backupCode") : t("fields.code")}
          error={missing && !ready ? t("fields.required") : undefined}
        >
          {(links) =>
            useBackup ? (
              <Input
                {...links}
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
              <SixDigitCode id={links.id} value={code} onChange={setCode} autoFocus />
            )
          }
        </FormField>
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
          <Button type="submit" disabled={submitting}>
            {submitting && <Spinner />}
            {submitting ? t("twoFactor.submitting") : t("twoFactor.submit")}
          </Button>
        )}
      </form>
      <Button
        variant="link"
        className="self-start px-0"
        onClick={() => {
          setUseBackup(!useBackup);
          setCode("");
          setFailure(null);
          setMissing(false);
        }}
      >
        {useBackup ? t("twoFactor.useAuthenticator") : t("twoFactor.useBackupCode")}
      </Button>
    </div>
  );
}
