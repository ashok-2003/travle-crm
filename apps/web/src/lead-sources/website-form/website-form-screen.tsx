"use client";

// /settings/lead-sources/website-form (spec 3.2): the agency's enquiry form, in the order the agency works down it.
// Opening the page writes nothing: a form never saved shows its defaults. Loading, a load that failed with Try again,
// and a refusal's own sentence stand in for the page until it has the form.
import { useTranslations } from "next-intl";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { BackLink } from "@/components/text-link";
import { routes } from "@/lib/routes";
import { CountsCard } from "./counts-card";
import { HelpCard } from "./help-card";
import { StatusCard } from "./status-card";
import { useWebsiteForm } from "./use-website-form";
import { WebsiteFormEditor } from "./website-form-editor";

export function WebsiteFormScreen() {
  const t = useTranslations("websiteFormSettings.page");
  const tCommon = useTranslations("common");
  const { view: query, turnOn, turnOff, save } = useWebsiteForm();
  const view = query.data;

  if (view === undefined) {
    if (query.isError) {
      return (
        <ErrorState
          message={t("loadFailed")}
          error={query.error}
          retryLabel={tCommon("tryAgain")}
          onRetry={() => void query.refetch()}
        />
      );
    }
    return <LoadingRows rows={4} shape="twoLines" />;
  }

  return (
    <div className="flex max-w-[960px] flex-col gap-6">
      <BackLink href={routes.leadSources} label={t("back")} />
      <PageHeader
        title={t("title")}
        intro={view.ownerName === null ? t("introNoOwner") : t("intro", { owner: view.ownerName })}
      />
      <StatusCard view={view} turnOn={turnOn} turnOff={turnOff} />
      <WebsiteFormEditor view={view} save={save}>
        <CountsCard />
        <HelpCard />
      </WebsiteFormEditor>
    </div>
  );
}
