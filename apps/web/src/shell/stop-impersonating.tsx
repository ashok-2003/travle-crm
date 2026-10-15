"use client";

// Support's way back from impersonating a member (spec 6.1): Better Auth gives support's own session back, the device
// forgets the member's data (data/session.ts), and the console opens with a full page load, so nothing of the
// member's stays in memory either. A stop that fails says why, and the page stays as it is.
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { authClient, type AuthClient } from "@/data/auth-client";
import { wipeLocalData } from "@/data/session";
import { useErrorMessage } from "@/lib/error-message";
import { loadPage } from "@/lib/navigate";
import { routes } from "@/lib/routes";

export function StopImpersonatingButton({ auth = authClient }: { auth?: Pick<AuthClient, "stopImpersonating"> }) {
  const t = useTranslations("shell.banners");
  const { authError } = useErrorMessage();
  const queryClient = useQueryClient();
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
    loadPage(routes.console);
  };

  return (
    <Button variant="outline" disabled={stopping} onClick={() => void stop()}>
      {stopping && <Spinner />}
      {stopping ? t("stopping") : t("stop")}
    </Button>
  );
}
