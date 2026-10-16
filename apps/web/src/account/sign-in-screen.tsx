"use client";

// The sign-in screen (spec 6.3): one address for everyone, two ways in. The organization-code way opens first, with
// the code filled in, once this device has used it. A person with two-factor sign-in goes on to type a code.
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AuthClient, SignInOutcome } from "@/data/auth-client";
import { routes } from "@/lib/routes";
import { CodeSignInForm } from "./code-sign-in-form";
import { EmailSignInForm } from "./email-sign-in-form";
import { useFinishSignIn } from "./finish-sign-in";
import { nextPath } from "./next-path";
import { useRememberedOrganizationCode } from "./remembered-code";
import { TextLink } from "./text-link";

type Way = "email" | "code";

export function SignInScreen({ auth }: { auth?: Pick<AuthClient, "signInWithEmail" | "signInWithCode"> }) {
  const t = useTranslations("account.signIn");
  const router = useRouter();
  const next = nextPath(useSearchParams());
  const finishSignIn = useFinishSignIn();
  const rememberedCode = useRememberedOrganizationCode();
  // Until the person picks a tab, a remembered code decides which one opens.
  const [chosenWay, setChosenWay] = useState<Way | null>(null);
  const way = chosenWay ?? (rememberedCode ? "code" : "email");

  const onSignedIn = async ({ twoFactorRequired }: SignInOutcome) => {
    if (twoFactorRequired) router.push(`${routes.twoFactorChallenge}?next=${encodeURIComponent(next)}`);
    else await finishSignIn(next);
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} />
      <Tabs
        value={way}
        onValueChange={(value) => {
          setChosenWay(value === "code" ? "code" : "email");
        }}
        className="gap-5"
      >
        <TabsList className="w-full">
          <TabsTrigger value="email">{t("byEmail")}</TabsTrigger>
          <TabsTrigger value="code">{t("byCode")}</TabsTrigger>
        </TabsList>
        <TabsContent value="email">
          <EmailSignInForm onSignedIn={onSignedIn} {...(auth ? { auth } : {})} />
        </TabsContent>
        <TabsContent value="code">
          {/* Keyed by the code, so the form starts again filled in once the browser has read it. */}
          <CodeSignInForm
            key={rememberedCode ?? ""}
            rememberedCode={rememberedCode}
            onSignedIn={onSignedIn}
            {...(auth ? { auth } : {})}
          />
          <p className="mt-4 text-label text-muted-foreground">{t("noEmailHint")}</p>
        </TabsContent>
      </Tabs>
      <TextLink href={routes.forgotPassword}>{t("forgotPassword")}</TextLink>
    </div>
  );
}
