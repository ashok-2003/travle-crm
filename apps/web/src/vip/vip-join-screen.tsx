"use client";

// Opening an invite's link (the invite program, the owner, 2026-10-28): the invite is opened at once (the first time
// it makes the company's organization), the owner is signed in with the one-time password it answers, typing nothing,
// and the app opens on its home, where the welcome plays. A link already used once its owner chose a password sends
// them to sign in with their organization's code; an unknown or cancelled link says so.
import { vipInviteOpened, type VipInviteOpened } from "@travel-crm/contracts/usage";
import { CrownIcon, LinkIcon } from "lucide-react";
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

type Shown = { kind: "working"; company: string | null } | { kind: "failed" } | VipInviteOpened;

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

export function VipJoinScreen({ token }: { token: string }) {
  const t = useTranslations("vip");
  const finishSignIn = useFinishSignIn();
  const [shown, setShown] = useState<Shown>({ kind: "working", company: null });
  const [attempt, setAttempt] = useState(0);
  const started = useRef(-1);

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
      setShown({ kind: "working", company: opened.companyName });
      const signedIn = await authClient.signInWithCode({
        orgCode: opened.orgCode,
        username: opened.username,
        password: opened.password,
      });
      if (!signedIn.ok) {
        setShown({ kind: "failed" });
        return;
      }
      await finishSignIn(routes.home);
    })();
  }, [token, attempt, finishSignIn]);

  if ("kind" in shown && shown.kind === "working") {
    return (
      <Card>
        <CardHeader className="items-center text-center">
          <span
            aria-hidden="true"
            className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground"
          >
            <CrownIcon className="size-7" />
          </span>
          <CardTitle>
            <h1 className="text-section">
              {shown.company === null ? t("opening") : t("settingUp", { company: shown.company })}
            </h1>
          </CardTitle>
          <CardDescription>{t("moment")}</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center pb-6">
          <Spinner className="size-6 text-primary" aria-label={t("opening")} />
        </CardContent>
      </Card>
    );
  }
  if ("state" in shown && shown.state === "joined") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>
            <h1 className="text-section">{t("joinedTitle", { company: shown.companyName })}</h1>
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
            setShown({ kind: "working", company: null });
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
