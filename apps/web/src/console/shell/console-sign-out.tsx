"use client";

// Signing out of the console: its query cache empties first, then the app's own sign-out runs (data/session.ts): the
// screen goes at once, other tabs are told, and the sign-in screen opens while the api is told on the way out.
import { useQueryClient } from "@tanstack/react-query";
import { LogOutIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { usePageData } from "@/data/providers";

/** Signing out of the console, for the button here and the sidebar's menu button. */
export function useConsoleSignOut(): () => void {
  // The console's own cache: ConsoleProviders' QueryClientProvider is the nearest.
  const queryClient = useQueryClient();
  const page = usePageData();
  return () => {
    void queryClient.cancelQueries();
    queryClient.clear();
    void page.signOut();
  };
}

export function ConsoleSignOutButton() {
  const t = useTranslations("console.navigation");
  const signOut = useConsoleSignOut();
  return (
    <Button variant="ghost" onClick={signOut}>
      <LogOutIcon aria-hidden="true" />
      {t("signOut")}
    </Button>
  );
}
