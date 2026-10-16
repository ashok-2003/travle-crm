"use client";

// The last step of two-factor setup: the backup codes, shown this once, to copy or write down, then on to whatever
// the api still asks. Nothing that fails here is silent: a browser that won't copy says so, and so does a next screen
// that doesn't open, with the codes still on screen.
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { RefusalAlert } from "@/components/refusal-alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { focusWhenShown } from "./focus";

export function BackupCodes({ codes, onDone }: { codes: string[]; onDone: () => Promise<void> | void }) {
  const t = useTranslations("account.twoFactorSetup");
  const tCommon = useTranslations("common");
  const id = useId();
  const [copied, setCopied] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<unknown>(null);

  const copyCodes = async () => {
    try {
      // No clipboard outside a secure page, and a refusal without permission: either way, they're written down.
      await navigator.clipboard.writeText(codes.join("\n"));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const done = async () => {
    setBusy(true);
    setProblem(null);
    try {
      await onDone();
    } catch (error) {
      setProblem(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-5" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} ref={focusWhenShown} tabIndex={-1} className="text-section font-semibold">
        {t("backupTitle")}
      </h2>
      <p>{t("backupIntro")}</p>
      <Card>
        <CardContent>
          <ul className="numbers grid grid-cols-2 gap-2">
            {codes.map((code) => (
              <li key={code}>{code}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Button variant="outline" onClick={() => void copyCodes()}>
        {copied === true ? t("copied") : t("copyCodes")}
      </Button>
      {copied === false && (
        <p role="alert" className="text-label">
          {t("copyFailed")}
        </p>
      )}
      <RefusalAlert error={problem} />
      <Button onClick={() => void done()} disabled={busy}>
        {busy && <Spinner />}
        {busy ? tCommon("continuing") : t("done")}
      </Button>
    </section>
  );
}
