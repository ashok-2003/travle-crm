"use client";

// Opening an invite's link (the invite program, the owner, 2026-10-28): the invite is opened at once (the first time
// it makes the company's organization), the owner is signed in with the one-time password it answers, typing nothing,
// and the app opens on its home, where the welcome plays. While that happens, the company's name and three steps
// ticking through (its workspace, its team and AI sales agent, its free days). A link already used once its owner
// chose a password sends them to sign in; an unknown or cancelled link says so.
import { vipInviteOpened, type VipInviteOpened } from "@travel-crm/contracts/usage";
import { CheckIcon, LinkIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { useFinishSignIn } from "@/account/finish-sign-in";
import { EmptyState } from "@/components/empty-state";
import { TextLink } from "@/components/text-link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/data/auth-client";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

interface Working {
  kind: "working";
  company: string | null;
  trialDays: number | null;
}
type Shown = Working | { kind: "failed" } | Exclude<VipInviteOpened, { state: "signIn" }>;

/** How long each step shows before the next, so the setting up reads as it happens. */
const STEP_MS = 900;
const STEPS = ["workspace", "team", "trial"] as const;

async function openInvite(token: string): Promise<VipInviteOpened | null> {
  try {
    const response = await fetch(`/api/platform/public/vip/${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
      credentials: "same-origin",
    });
    if (!response.ok) return null;
    const parsed = vipInviteOpened.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function SettingUp({ shown, step }: { shown: Working; step: number }) {
  const t = useTranslations("vip");
  return (
    <Card>
      <CardHeader className="gap-2">
        <p className="text-label font-semibold tracking-wide text-primary uppercase">{t("eyebrow")}</p>
        <CardTitle>
          <h1 className="text-title-mobile leading-tight">
            {shown.company === null ? t("opening") : t("welcomeCompany", { company: shown.company })}
          </h1>
        </CardTitle>
        <CardDescription>{t("moment")}</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col gap-3" aria-live="polite">
          {STEPS.map((key, index) => {
            const done = index < step;
            const current = index === step;
            return (
              <li
                key={key}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-3 transition-colors",
                  current ? "bg-muted" : "",
                  !done && !current && "opacity-50",
                )}
              >
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full",
                    done ? "bg-primary text-primary-foreground" : "bg-muted",
                  )}
                >
                  {done ? (
                    <CheckIcon aria-hidden="true" className="size-4" />
                  ) : current ? (
                    <Spinner aria-hidden="true" className="size-4 text-primary" />
                  ) : null}
                </span>
                <span className={cn("text-body", done || current ? "text-foreground" : "text-muted-foreground")}>
                  {t(`steps.${key}`, { days: shown.trialDays ?? 30 })}
                </span>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}

export function VipJoinScreen({ token }: { token: string }) {
  const t = useTranslations("vip");
  const finishSignIn = useFinishSignIn();
  const [shown, setShown] = useState<Shown>({ kind: "working", company: null, trialDays: null });
  const [step, setStep] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const started = useRef(-1);
  const working = "kind" in shown && shown.kind === "working";

  // The steps tick on while the work goes on; the last waits for the sign-in to finish.
  useEffect(() => {
    if (!working) return;
    const timer = window.setInterval(() => {
      setStep((current) => Math.min(current + 1, STEPS.length - 1));
    }, STEP_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [working]);

  useEffect(() => {
    // Once per attempt, even when React runs the effect twice in development.
    if (started.current === attempt) return;
    started.current = attempt;
    void (async () => {
      const opened = await openInvite(token);
      if (opened === null) {
        setShown({ kind: "failed" });
        return;
      }
      if (opened.state !== "signIn") {
        setShown(opened);
        return;
      }
      setShown({ kind: "working", company: opened.companyName, trialDays: opened.trialDays });
      const signedIn = await authClient.signInWithCode({
        orgCode: opened.orgCode,
        username: opened.username,
        password: opened.password,
      });
      if (!signedIn.ok) {
        setShown({ kind: "failed" });
        return;
      }
      setStep(STEPS.length);
      await new Promise((resolve) => setTimeout(resolve, 500));
      await finishSignIn(routes.home);
    })();
  }, [token, attempt, finishSignIn]);

  if ("kind" in shown && shown.kind === "working") return <SettingUp shown={shown} step={step} />;
  if ("state" in shown && shown.state === "joined") {
    return (
      <Card>
        <CardHeader className="gap-2">
          <p className="text-label font-semibold tracking-wide text-primary uppercase">{t("eyebrow")}</p>
          <CardTitle>
            <h1 className="text-title-mobile leading-tight">{t("joinedTitle", { company: shown.companyName })}</h1>
          </CardTitle>
          <CardDescription>{t("joinedDescription", { code: shown.orgCode })}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild size="lg" className="w-full">
            <a href={routes.signIn}>{t("signIn")}</a>
          </Button>
        </CardContent>
      </Card>
    );
  }
  if ("kind" in shown) {
    return (
      <div className="flex flex-col items-center gap-4">
        <EmptyState icon={LinkIcon} message={t("failed")} />
        <Button
          variant="outline"
          onClick={() => {
            setStep(0);
            setShown({ kind: "working", company: null, trialDays: null });
            setAttempt((current) => current + 1);
          }}
        >
          {t("tryAgain")}
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <EmptyState icon={LinkIcon} message={t("closed")} />
      <TextLink href={routes.signIn}>{t("signIn")}</TextLink>
    </div>
  );
}
