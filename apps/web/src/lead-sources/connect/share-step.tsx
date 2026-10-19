"use client";

// Step 1 of connecting (spec 6.5, S3-S5): share the sheet with our address, paste its link, Check the sheet. Each way
// the check can fail has its own sentence under the field.
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { FormField } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RefusalAlert } from "@/components/refusal-alert";
import { BackLink } from "@/components/text-link";
import { useTRPC } from "@/data/trpc";
import { refusalOf } from "@/data/api-error";
import { useErrorMessage } from "@/lib/error-message";
import { routes, sheetConnectStepRoute } from "@/lib/routes";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { SheetAddress } from "../sheet-address";
import { useLeadSheets, useRefreshLeadSheets } from "../use-lead-sheets";
import { ConnectCaption } from "./connect-caption";

/** The reasons the link field shows under itself; others (the limit, not set up, busy) go above the button. */
const fieldReasons = new Set([
  "SHEET_LINK_INVALID",
  "SHEET_NOT_SHARED",
  "SHEET_NOT_GOOGLE_SHEET",
  "SHEET_EMPTY",
  "SHEET_ALREADY_CONNECTED",
  "SHEET_CLAIMED_ELSEWHERE",
]);

export function ShareStep() {
  const t = useTranslations("sheets.connect");
  const trpc = useTRPC();
  const router = useRouter();
  const write = useWriteAccess("change");
  const hintId = useId();
  const { apiError } = useErrorMessage();
  const refresh = useRefreshLeadSheets();
  const emails = useLeadSheets().data?.serviceAccountEmails ?? [];
  const [link, setLink] = useState("");

  const begin = useMutation(
    trpc.leadSheets.begin.mutationOptions({
      onSuccess: async ({ sheetId }) => {
        await refresh();
        router.push(sheetConnectStepRoute(sheetId));
      },
    }),
  );
  const reason = refusalOf(begin.error)?.reason ?? null;
  const underField = reason !== null && fieldReasons.has(reason);

  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <BackLink href={routes.leadSources} label={t("back")} />
      <PageHeader title={t("title")} intro={t("intro")} />
      <ConnectCaption step="share" />
      <form
        className="flex flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          begin.mutate({ link });
        }}
      >
        <section className="flex flex-col gap-2" aria-labelledby="share-title">
          <h2 id="share-title" className="text-section font-semibold">
            1. {t("share.addressTitle", { count: emails.length })}
          </h2>
          <SheetAddress emails={emails} />
          <p className="text-label text-muted-foreground">{t("share.help")}</p>
        </section>
        <section className="flex flex-col gap-2" aria-labelledby="paste-title">
          <h2 id="paste-title" className="text-section font-semibold">
            2. {t("share.linkTitle")}
          </h2>
          <FormField
            label={t("share.linkLabel")}
            hint={t("share.linkHint")}
            error={underField ? apiError(begin.error) : undefined}
          >
            {(links) => (
              <Input
                {...links}
                type="url"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                value={link}
                disabled={begin.isPending}
                onChange={(event) => {
                  setLink(event.target.value);
                }}
              />
            )}
          </FormField>
        </section>
        {!underField && <RefusalAlert error={begin.error} />}
        <div className="flex flex-col items-start gap-2">
          <Button
            type="submit"
            disabled={link.trim() === "" || begin.isPending || !write.allowed}
            aria-describedby={write.hint ? hintId : undefined}
          >
            {begin.isPending ? t("share.checking") : t("share.check")}
          </Button>
          <WriteHint id={hintId} hint={write.hint} />
        </div>
      </form>
    </div>
  );
}
