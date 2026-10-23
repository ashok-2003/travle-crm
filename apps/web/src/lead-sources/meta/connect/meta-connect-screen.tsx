"use client";

// /settings/lead-sources/meta/connect (spec 3.2 step 1): what we do with the Page, in one sentence, and Continue with
// Facebook, which opens Facebook's own dialog (a redirect, not a popup, so it works on a phone). The dialog is for our
// saved configuration; the person logs in there and chooses the Pages to share. Facebook sends the browser back to the
// callback page.
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { PageHeader } from "@/components/page-header";
import { RefusalAlert } from "@/components/refusal-alert";
import { BackLink } from "@/components/text-link";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useTRPC } from "@/data/trpc";
import { loadPage } from "@/lib/navigate";
import { routes } from "@/lib/routes";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";

export function MetaConnectScreen() {
  const t = useTranslations("metaLeads.connect");
  const trpc = useTRPC();
  const write = useWriteAccess("change");
  const hintId = useId();
  // The page is left for Facebook's: the button stays on "Opening Facebook…" once the address is known.
  const start = useMutation(
    trpc.metaLeads.connectStart.mutationOptions({
      onSuccess: ({ authorizeUrl }) => {
        loadPage(authorizeUrl);
      },
    }),
  );
  const opening = start.isPending || start.isSuccess;
  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <BackLink href={routes.leadSources} label={t("back")} />
      <PageHeader title={t("title")} intro={t("intro")} />
      <p className="text-label text-muted-foreground">{t("tip")}</p>
      <RefusalAlert error={start.error} />
      <div className="flex flex-col items-start gap-2">
        <Button
          disabled={opening || !write.allowed}
          aria-describedby={write.hint ? hintId : undefined}
          onClick={() => {
            start.mutate({});
          }}
        >
          {opening && <Spinner />}
          {opening ? t("opening") : t("continue")}
        </Button>
        <WriteHint id={hintId} hint={write.hint} />
      </div>
    </div>
  );
}
