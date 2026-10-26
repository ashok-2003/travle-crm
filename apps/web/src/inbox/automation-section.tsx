"use client";

// The automatic answers on /settings/whatsapp (sales inbox spec 6), for the Owner and Admins: an away message, a welcome and
// keyword answers. Each is written as an automatic reply, sent inside the window the customer just opened, never to someone
// who asked to stop, at most once in a while per chat, and not in a chat where a person has just replied.
import { useTranslations } from "next-intl";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { AutomationForm } from "./automation-form";
import { KeywordAnswers } from "./keyword-answers";
import { useAutomation } from "./use-sales-inbox";

export function AutomationSection() {
  const t = useTranslations("inbox.automation");
  const { settings } = useAutomation(true);
  return (
    <section aria-labelledby="automation-heading" className="flex flex-col gap-4">
      <h2 id="automation-heading" className="text-section font-semibold">
        {t("title")}
      </h2>
      <p className="max-w-[65ch] text-muted-foreground">{t("intro")}</p>
      {settings.data === undefined ? (
        settings.isError ? (
          <ErrorState
            message={t("loadFailed")}
            error={settings.error}
            retryLabel={t("retry")}
            onRetry={() => void settings.refetch()}
          />
        ) : (
          <LoadingRows shape="twoLines" label={t("loading")} />
        )
      ) : (
        <AutomationForm saved={settings.data} />
      )}
      <KeywordAnswers />
    </section>
  );
}
