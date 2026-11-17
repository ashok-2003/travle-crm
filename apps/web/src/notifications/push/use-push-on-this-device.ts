"use client";

// Push on this device, for the notification choices' page, the pop-up and the console's alerts (each brings its api): its state, asked of the browser when the page opens, and
// again once the service worker is ready (on a first visit it registers while the page opens), and turning push on
// or off. A failure shows its sentence: the api's refusal, or the browser's own failure to subscribe.
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useErrorMessage } from "@/lib/error-message";
import type { PushApi } from "./push-api";
import { pushState, turnPushOff, turnPushOn, type PushState } from "./push-device";

/** `onChecked` hears this device's settled state once per page (not while the worker is still to register). */
export function usePushOnThisDevice(api: PushApi, onChecked?: (state: PushState) => void) {
  const t = useTranslations("notifications.push");
  const { apiError } = useErrorMessage();
  const [state, setState] = useState<PushState | "checking">("checking");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    const check = async () => {
      const found = await pushState().catch((): PushState => "unsupported");
      if (mounted) setState(found);
      return found;
    };
    void check()
      .then(async (found) => {
        if (found !== "no-worker" || !("serviceWorker" in navigator)) return found;
        await navigator.serviceWorker.ready;
        return check();
      })
      .then((settled) => {
        if (mounted && settled !== "no-worker") onChecked?.(settled);
      });
    return () => {
      mounted = false;
    };
  }, [onChecked]);

  async function change(turn: (api: PushApi) => Promise<PushState>): Promise<PushState | null> {
    setBusy(true);
    try {
      const turned = await turn(api);
      setState(turned);
      return turned;
    } catch (error) {
      // The browser's own failures (no push service, a refused key) are DOMExceptions; the rest are the api's.
      toast.error(error instanceof DOMException ? t("failed") : apiError(error), { duration: Infinity });
    } finally {
      setBusy(false);
    }
    return null;
  }

  return {
    state,
    busy,
    turnOn: () => change(turnPushOn),
    turnOff: () => change(turnPushOff),
  };
}
