"use client";

// Support's way back from impersonating a member (spec 6.1): Better Auth gives support's own session back, the app's
// data on this device is wiped (data/session.ts), then the other tabs, which still hold it, are told to do the same,
// and the console opens with a full page load, so nothing of the member's stays in memory either. A stop that fails
// says why, and the page stays as it is.
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { authClient, type AuthClient } from "@/data/auth-client";
import { announceSignOut, wipeLocalData } from "@/data/session";
import { useErrorMessage } from "@/lib/error-message";
import { loadPage } from "@/lib/navigate";
import { reportProblem } from "@/lib/report-problem";
import { routes } from "@/lib/routes";

export function StopImpersonatingButton({
  queryClient: appCache,
  auth = authClient,
}: {
  /** The app's cache, which holds the member's data, where it isn't the nearest one (inside the console). */
  queryClient?: QueryClient;
  auth?: Pick<AuthClient, "stopImpersonating">;
}) {
  const t = useTranslations("shell.banners");
  const { authError } = useErrorMessage();
  const queryClient = useQueryClient(appCache);
  const [stopping, setStopping] = useState(false);

  const stop = async () => {
    setStopping(true);
    const result = await auth.stopImpersonating();
    if (!result.ok) {
      toast.error(authError(result));
      setStopping(false);
      return;
    }
    await wipeLocalData(queryClient);
    // Support's own session is back: the console opens whatever happens here.
    try {
      announceSignOut();
    } catch (error) {
      reportProblem(error);
    }
    loadPage(routes.console);
  };

  return (
    <Button variant="outline" disabled={stopping} onClick={() => void stop()}>
      {stopping && <Spinner />}
      {stopping ? t("stopping") : t("stop")}
    </Button>
  );
}
