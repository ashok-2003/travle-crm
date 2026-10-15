"use client";

// Signing out of the console: its query cache empties first, then the app's own sign-out runs (data/session.ts): the
// screen goes at once, other tabs are told, and the sign-in screen opens while the api is told on the way out.
import { useQueryClient } from "@tanstack/react-query";
import { LogOutIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { usePageData } from "@/data/providers";

export function ConsoleSignOutButton({ className }: { className?: string }) {
  const t = useTranslations("console.navigation");
  // The console's own cache: ConsoleProviders' QueryClientProvider is the nearest.
  const queryClient = useQueryClient();
  const page = usePageData();
  const signOut = () => {
    void queryClient.cancelQueries();
    queryClient.clear();
    void page.signOut();
  };
  return (
    <Button variant="ghost" className={className} onClick={signOut}>
      <LogOutIcon aria-hidden="true" />
      {t("signOut")}
    </Button>
  );
}
