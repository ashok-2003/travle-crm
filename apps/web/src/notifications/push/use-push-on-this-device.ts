"use client";

// Push on this device, for the notification choices' page: its state, asked of the browser when the page opens, and
// again once the service worker is ready (on a first visit it registers while the page opens), and turning push on
// or off. A failure shows its sentence: the api's refusal, or the browser's own failure to subscribe.
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useTRPCClient } from "@/data/trpc";
import { useErrorMessage } from "@/lib/error-message";
import { pushApi, type PushApi } from "./push-api";
import { pushState, turnPushOff, turnPushOn, type PushState } from "./push-device";

export function usePushOnThisDevice() {
  const t = useTranslations("notifications.push");
  const { apiError } = useErrorMessage();
  const client = useTRPCClient();
  const [state, setState] = useState<PushState | "checking">("checking");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    const check = async () => {
      const found = await pushState().catch((): PushState => "unsupported");
      if (mounted) setState(found);
      return found;
    };
    void check().then((found) => {
      if (found === "no-worker" && "serviceWorker" in navigator) void navigator.serviceWorker.ready.then(check);
    });
    return () => {
      mounted = false;
    };
  }, []);

  async function change(turn: (api: PushApi) => Promise<PushState>): Promise<void> {
    setBusy(true);
    try {
      setState(await turn(pushApi(client)));
    } catch (error) {
      // The browser's own failures (no push service, a refused key) are DOMExceptions; the rest are the api's.
      toast.error(error instanceof DOMException ? t("failed") : apiError(error), { duration: Infinity });
    } finally {
      setBusy(false);
    }
  }

  return {
    state,
    busy,
    turnOn: () => change(turnPushOn),
    turnOff: () => change(turnPushOff),
  };
}
