"use client";

// /settings/lead-sources/meta/callback (spec 3.2 step 2, spec 7): where Facebook's dialog sends the browser back. It is
// client-side: it reads `code` and `state` from the address once, clears them from the address at once (no code stays in
// the URL, the history or the Referer), and posts them to the api, which exchanges the code (the app secret never reaches
// the browser) and lists the Pages the person shared. A reconnect finishes right there. Otherwise the person ticks the Pages
// to connect, and the connected ones lead on to their page.
import { useMutation } from "@tanstack/react-query";
import type { MetaConnectedPages } from "@travel-crm/contracts/meta-leads";
import { CircleAlertIcon, LoaderCircleIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { RefusalAlert } from "@/components/refusal-alert";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useTRPC, useTRPCClient } from "@/data/trpc";
import errors from "@/i18n/messages/en-IN/errors.json";
import { metaConnectRoute, metaPageRoute, routes } from "@/lib/routes";
import { useWriteAccess } from "@/subscription/write-access";
import { useRefreshMeta } from "../use-meta-pages";
import { ChoosePages } from "./choose-pages";

/** What the address held: Facebook's code and our state, or nothing usable (the dialog was cancelled or refused). */
function readAddress(): { code: string; state: string } | null {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const state = params.get("state");
  // Whatever it held, the address is clean from here on.
  window.history.replaceState(null, "", window.location.pathname);
  return code !== null && code !== "" && state !== null && state !== "" ? { code, state } : null;
}

const reasonSentence = (reason: string): string =>
  Object.hasOwn(errors.reasons, reason) ? ((errors.reasons as Record<string, string>)[reason] ?? "") : "";

export function MetaCallbackScreen() {
  const t = useTranslations("metaLeads.callback");
  const tConnect = useTranslations("metaLeads.connect");
  const trpc = useTRPC();
  const client = useTRPCClient();
  const router = useRouter();
  const write = useWriteAccess("change");
  const refresh = useRefreshMeta();
  const [ticked, setTicked] = useState<ReadonlySet<string> | null>(null);
  const [outcome, setOutcome] = useState<MetaConnectedPages | null>(null);

  // Reading the address is the request's first step, so it happens once and never in a render: null means Facebook sent
  // nothing usable (the dialog was cancelled or refused).
  const finish = useMutation({
    mutationFn: async () => {
      const given = readAddress();
      return given === null ? null : client.metaLeads.connectFinish.mutate(given);
    },
    onSuccess: async (shared) => {
      if (shared === null) return;
      await refresh();
      // A reconnect has nothing to choose: the Page is running again, on its own page.
      if (shared.reconnectPageRowId !== null) router.replace(metaPageRoute(shared.reconnectPageRowId));
      else setTicked(new Set(shared.pages.filter((page) => page.availability === "available").map((p) => p.pageId)));
    },
  });
  const connect = useMutation(
    trpc.metaLeads.connectPages.mutationOptions({
      onSuccess: async (result) => {
        await refresh();
        const [only] = result.connected;
        if (result.refused.length === 0 && only !== undefined && result.connected.length === 1) {
          router.replace(metaPageRoute(only.id));
        } else if (result.refused.length === 0) router.replace(routes.leadSources);
        else setOutcome(result);
      },
    }),
  );

  // The code is single-use: read once, whatever React does with effects in development.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    finish.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- finish is a new object every render
  }, []);

  const cancelled = finish.isSuccess && finish.data === null;
  if (cancelled || finish.isError) {
    return (
      <div className="flex max-w-[720px] flex-col gap-6">
        <PageHeader title={t("title")} />
        {cancelled ? (
          <Alert variant="destructive">
            <CircleAlertIcon aria-hidden="true" />
            <AlertDescription>{t("cancelled")}</AlertDescription>
          </Alert>
        ) : (
          <RefusalAlert error={finish.error} />
        )}
        <Button asChild className="self-start">
          <Link href={metaConnectRoute}>{t("startAgain")}</Link>
        </Button>
      </div>
    );
  }

  const shared = finish.data;
  if (shared === undefined || shared === null || ticked === null) {
    return (
      <div className="flex max-w-[720px] flex-col gap-6">
        <PageHeader title={t("title")} />
        <div role="status" className="flex items-center gap-3">
          <LoaderCircleIcon aria-hidden="true" className="size-5 motion-safe:animate-spin" />
          <p>{t("reading")}</p>
        </div>
      </div>
    );
  }

  if (outcome !== null) {
    return (
      <div className="flex max-w-[720px] flex-col gap-6">
        <PageHeader title={t("title")} />
        <div className="flex flex-col gap-3">
          {outcome.refused.map((refused) => {
            const name = shared.pages.find((page) => page.pageId === refused.pageId)?.name ?? refused.pageId;
            return (
              <Alert key={refused.pageId} variant="destructive">
                <CircleAlertIcon aria-hidden="true" />
                <AlertDescription>
                  {t("partial", { name })} {reasonSentence(refused.reason)}
                </AlertDescription>
              </Alert>
            );
          })}
        </div>
        <Button asChild className="self-start">
          <Link href={routes.leadSources}>{tConnect("back")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <PageHeader title={t("title")} intro={t("intro")} />
      <ChoosePages
        pages={shared.pages}
        ticked={ticked}
        onTick={(pageId, on) => {
          const next = new Set(ticked);
          if (on) next.add(pageId);
          else next.delete(pageId);
          setTicked(next);
        }}
        busy={connect.isPending}
        allowed={write.allowed}
        writeHint={write.hint}
        onConnect={() => {
          connect.mutate({ pageIds: [...ticked] });
        }}
      />
      <RefusalAlert error={connect.error} />
    </div>
  );
}
