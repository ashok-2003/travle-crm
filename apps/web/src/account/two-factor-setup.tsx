"use client";

// Setting up two-factor sign-in, in three steps: confirm the password, scan the code and type the 6 digits the app
// shows (which turns it on), then save the backup codes, shown this once. An organization that requires two-factor
// sends its members here (the SET_UP_TWO_FACTOR step); anyone may come from their account.
import { useTranslations } from "next-intl";
import { useId, useState, type SubmitEvent } from "react";
import { PageTitle } from "@/components/page-title";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Spinner } from "@/components/ui/spinner";
import { authClient, type AuthClient, type TwoFactorSetup as Setup } from "@/data/auth-client";
import { AuthFailureAlert, type AuthFailure } from "./form-alert";
import { QrCode } from "./qr-code";

const CODE_LENGTH = 6;

type Step = { name: "password" } | { name: "scan"; setup: Setup } | { name: "backup"; setup: Setup };

/** The base32 secret in an otpauth:// link, grouped in fours for typing. */
function manualKey(totpUri: string): string {
  const secret = URL.parse(totpUri)?.searchParams.get("secret") ?? "";
  return secret.replace(/(.{4})(?=.)/g, "$1 ");
}

export function TwoFactorSetup({
  pending,
  onDone,
  auth = authClient,
}: {
  /** The organization requires two-factor and this is why the person is here. */
  pending: boolean;
  onDone: () => Promise<void> | void;
  auth?: Pick<AuthClient, "startTwoFactorSetup" | "confirmTwoFactor">;
}) {
  const t = useTranslations("account");
  const id = useId();
  const [step, setStep] = useState<Step>({ name: "password" });
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [failure, setFailure] = useState<AuthFailure | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setFailure(null);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  const start = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    void run(async () => {
      const result = await auth.startTwoFactorSetup({ password });
      if (result.ok) setStep({ name: "scan", setup: result.data });
      else setFailure(result);
    });
  };

  const confirm = (event: SubmitEvent<HTMLFormElement>, setup: Setup) => {
    event.preventDefault();
    void run(async () => {
      const result = await auth.confirmTwoFactor({ code });
      if (result.ok) setStep({ name: "backup", setup });
      else setFailure(result);
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <PageTitle>{t("twoFactorSetup.title")}</PageTitle>
      <p className="text-muted-foreground">{pending ? t("twoFactorSetup.pendingIntro") : t("twoFactorSetup.intro")}</p>

      {step.name === "password" && (
        <form noValidate onSubmit={start} className="flex flex-col gap-5">
          <p>{t("twoFactorSetup.passwordStep")}</p>
          <Field>
            <FieldLabel htmlFor={`${id}-password`}>{t("fields.password")}</FieldLabel>
            <Input
              id={`${id}-password`}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
              }}
            />
          </Field>
          <AuthFailureAlert failure={failure} />
          <Button type="submit" disabled={busy || password === ""}>
            {busy && <Spinner />}
            {busy ? t("twoFactorSetup.starting") : t("twoFactorSetup.start")}
          </Button>
        </form>
      )}

      {step.name === "scan" && (
        <form
          noValidate
          onSubmit={(event) => {
            confirm(event, step.setup);
          }}
          className="flex flex-col gap-5"
        >
          <p>{t("twoFactorSetup.scan")}</p>
          <QrCode
            value={step.setup.totpUri}
            label={t("twoFactorSetup.qrLabel")}
            className="size-48 self-center rounded-lg border bg-background p-2 text-foreground"
          />
          <p className="text-label text-muted-foreground">
            {t("twoFactorSetup.manualKey")}{" "}
            <span className="numbers break-all text-foreground">{manualKey(step.setup.totpUri)}</span>
          </p>
          <Field>
            <FieldLabel htmlFor={`${id}-code`}>{t("twoFactorSetup.confirmStep")}</FieldLabel>
            <InputOTP
              id={`${id}-code`}
              maxLength={CODE_LENGTH}
              value={code}
              onChange={setCode}
              inputMode="numeric"
              pattern="^[0-9]+$"
              autoComplete="one-time-code"
            >
              <InputOTPGroup className="numbers">
                {Array.from({ length: CODE_LENGTH }, (_, index) => (
                  <InputOTPSlot key={index} index={index} className="size-11 text-number-lg" />
                ))}
              </InputOTPGroup>
            </InputOTP>
          </Field>
          <AuthFailureAlert failure={failure} />
          <Button type="submit" disabled={busy || code.length !== CODE_LENGTH}>
            {busy && <Spinner />}
            {busy ? t("twoFactorSetup.confirming") : t("twoFactorSetup.confirm")}
          </Button>
        </form>
      )}

      {step.name === "backup" && (
        <section className="flex flex-col gap-5" aria-labelledby={`${id}-backup`}>
          <h2 id={`${id}-backup`} className="text-section font-semibold">
            {t("twoFactorSetup.backupTitle")}
          </h2>
          <p>{t("twoFactorSetup.backupIntro")}</p>
          <ul className="numbers grid grid-cols-2 gap-2 rounded-lg border bg-surface p-4">
            {step.setup.backupCodes.map((backupCode) => (
              <li key={backupCode}>{backupCode}</li>
            ))}
          </ul>
          <Button
            variant="outline"
            onClick={() => {
              void navigator.clipboard.writeText(step.setup.backupCodes.join("\n")).then(() => {
                setCopied(true);
              });
            }}
          >
            {copied ? t("twoFactorSetup.copied") : t("twoFactorSetup.copyCodes")}
          </Button>
          <Button
            onClick={() => {
              void run(async () => {
                await onDone();
              });
            }}
            disabled={busy}
          >
            {t("twoFactorSetup.done")}
          </Button>
        </section>
      )}
    </div>
  );
}
