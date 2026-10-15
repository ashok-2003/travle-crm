"use client";

// Signing out: the device forgets the organization's data, the api ends the session, and the sign-in screen opens.
import { useQueryClient } from "@tanstack/react-query";
import { LogOutIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/data/auth-client";
import { signOut } from "@/data/session";
import { loadPage } from "@/lib/navigate";
import { reportProblem } from "@/lib/report-problem";
import { routes } from "@/lib/routes";

export function useSignOut() {
  const queryClient = useQueryClient();
  const [signingOut, setSigningOut] = useState(false);
  const run = async () => {
    setSigningOut(true);
    try {
      await signOut(queryClient, authClient);
    } catch (error) {
      // signOut reports its own failures and doesn't reject; this keeps anything unforeseen from going unreported.
      reportProblem(error);
    }
    loadPage(routes.signIn);
  };
  return { signingOut, signOut: run };
}

export function SignOutButton({ className }: { className?: string }) {
  const t = useTranslations("shell.navigation");
  const { signingOut, signOut: run } = useSignOut();
  return (
    <Button variant="ghost" className={className} disabled={signingOut} onClick={() => void run()}>
      <LogOutIcon aria-hidden="true" />
      {signingOut ? t("signingOut") : t("signOut")}
    </Button>
  );
}
