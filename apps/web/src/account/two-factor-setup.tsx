"use client";

// Setting up two-factor sign-in, in three steps: confirm the password, scan the code and type the 6 digits the app
// shows (which turns it on), then save the backup codes, shown this once. An organization that requires two-factor
// sends its members here (the SET_UP_TWO_FACTOR step); anyone may come from their account, and go back to it.
// The secret and the codes live only in this component's state, so leaving the page drops them: Next keeps no hidden
// copy of a page left behind while Cache Components is off (next/dist/client/components/bfcache-state-manager.js:13).
// Turning it on keeps up to three, secrets included.
import { useTranslations } from "next-intl";
import { useId, useState, type SubmitEvent } from "react";
import { PageTitle } from "@/components/page-title";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { authClient, type AuthClient } from "@/data/auth-client";
import { routes } from "@/lib/routes";
import { BackupCodes } from "./backup-codes";
import { focusWhenShown } from "./focus";
import { AuthFailureAlert, type AuthFailure } from "./form-alert";
import { QrCode } from "./qr-code";
import { CODE_LENGTH, SixDigitCode } from "./six-digit-code";
import { TextLink } from "./text-link";

// Once two-factor is on, the backup step keeps only the codes: the secret has done its job.
type Step =
  | { name: "password" }
  | { name: "scan"; totpUri: string; backupCodes: string[] }
  | { name: "backup"; backupCodes: string[] };

/** Shown as "Something went wrong": no code, a server-fault status. */
const unexpected: AuthFailure = { ok: false, status: 500, code: "UNEXPECTED", retryAfterSeconds: null };

/** The base32 secret in an otpauth:// link, grouped in fours for typing. URL.parse is too new (Safari 18). */
function manualKey(totpUri: string): string {
  let secret = "";
  try {
    secret = new URL(totpUri).searchParams.get("secret") ?? "";
  } catch {
    // Not a link: there is no key to show, and the QR code holds the same text.
  }
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

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setFailure(null);
    try {
      await action();
    } catch {
      // The auth calls answer their failures rather than throw them, so this is a fault: say so, not nothing.
      setFailure(unexpected);
    } finally {
      setBusy(false);
    }
  };

  const start = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    void run(async () => {
      const result = await auth.startTwoFactorSetup({ password });
      if (result.ok) setStep({ name: "scan", ...result.data });
      else setFailure(result);
    });
  };

  const confirm = (event: SubmitEvent<HTMLFormElement>, backupCodes: string[]) => {
    event.preventDefault();
    void run(async () => {
      const result = await auth.confirmTwoFactor({ code });
      if (result.ok) setStep({ name: "backup", backupCodes });
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
            confirm(event, step.backupCodes);
          }}
          className="flex flex-col gap-5"
        >
          {/* The step's first line takes the focus: the code to scan and the key to type come before the digits. */}
          <p ref={focusWhenShown} tabIndex={-1}>
            {t("twoFactorSetup.scan")}
          </p>
          <QrCode
            value={step.totpUri}
            label={t("twoFactorSetup.qrLabel")}
            className="size-48 self-center rounded-lg border bg-background p-2 text-foreground"
          />
          <p className="text-label text-muted-foreground">
            {t("twoFactorSetup.manualKey")}{" "}
            <span className="numbers break-all text-foreground">{manualKey(step.totpUri)}</span>
          </p>
          <Field>
            <FieldLabel htmlFor={`${id}-code`}>{t("twoFactorSetup.confirmStep")}</FieldLabel>
            <SixDigitCode id={`${id}-code`} value={code} onChange={setCode} />
          </Field>
          <AuthFailureAlert failure={failure} />
          <Button type="submit" disabled={busy || code.length !== CODE_LENGTH}>
            {busy && <Spinner />}
            {busy ? t("twoFactorSetup.confirming") : t("twoFactorSetup.confirm")}
          </Button>
        </form>
      )}

      {step.name === "backup" && <BackupCodes codes={step.backupCodes} onDone={onDone} />}

      {/* A setup the person chose can be left until it is on; one the api insists on can't be. */}
      {!pending && step.name !== "backup" && <TextLink href={routes.account}>{t("steps.backToAccount")}</TextLink>}
    </div>
  );
}
