"use client";

// The second step of a two-factor sign-in: the 6-digit code from the authenticator app, or a backup code. Better
// Auth remembers the first step in a short-lived cookie; if it has expired the person starts again.
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useId, useState, type SubmitEvent } from "react";
import { PageTitle } from "@/components/page-title";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Spinner } from "@/components/ui/spinner";
import { authClient, type AuthClient } from "@/data/auth-client";
import { routes } from "@/lib/routes";
import { AuthFailureAlert, type AuthFailure } from "./form-alert";
import { useFinishSignIn } from "./finish-sign-in";
import { nextPath } from "./next-path";

const CODE_LENGTH = 6;

export function TwoFactorChallenge({
  auth = authClient,
}: {
  auth?: Pick<AuthClient, "verifyTwoFactorCode" | "verifyBackupCode">;
}) {
  const t = useTranslations("account");
  const next = nextPath(useSearchParams());
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
    const input = { code: code.trim(), trustDevice };
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
            <InputOTP
              id={`${id}-code`}
              maxLength={CODE_LENGTH}
              value={code}
              onChange={setCode}
              inputMode="numeric"
              pattern="^[0-9]+$"
              autoComplete="one-time-code"
              autoFocus
            >
              <InputOTPGroup className="numbers">
                {Array.from({ length: CODE_LENGTH }, (_, index) => (
                  <InputOTPSlot key={index} index={index} className="size-11 text-number-lg" />
                ))}
              </InputOTPGroup>
            </InputOTP>
          )}
        </Field>
        <Field orientation="horizontal">
          <Checkbox
            id={`${id}-trust`}
            checked={trustDevice}
            onCheckedChange={(checked) => {
              setTrustDevice(checked === true);
            }}
          />
          <FieldLabel htmlFor={`${id}-trust`} className="font-normal">
            {t("twoFactor.trustDevice")}
          </FieldLabel>
        </Field>
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
