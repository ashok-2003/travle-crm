"use client";

// Signing out (data/session.ts): the screen goes at once, the device forgets the organization's data, and the sign-in
// screen opens without waiting for the api, which is told on the way out.
import { LogOutIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { usePageData } from "@/data/providers";

/** Signing out, for the button here and the sidebar's menu button. */
export function useSignOut(): () => void {
  const page = usePageData();
  return () => void page.signOut();
}

export function SignOutButton() {
  const t = useTranslations("shell.navigation");
  const signOut = useSignOut();
  return (
    <Button variant="ghost" onClick={signOut}>
      <LogOutIcon aria-hidden="true" />
      {t("signOut")}
    </Button>
  );
}
