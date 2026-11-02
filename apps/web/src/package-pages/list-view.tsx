// An agency's all-packages page (release 7b), server-rendered: its name and logo, and its published packages with a filter.
import type { PublicPackageList } from "@travel-crm/contracts/package-pages";
import { getTranslations } from "next-intl/server";
import { PageTitle } from "@/components/page-title";
import { AgencyHeader } from "./agency-header";
import { PackageFilter } from "./package-filter";
import { PageFrame } from "./page-frame";

export async function ListView({ list }: { list: PublicPackageList }) {
  const t = await getTranslations("packagePages.list");
  return (
    <PageFrame agency={list.agency}>
      <AgencyHeader agency={list.agency} withList={false} />
      <div className="flex flex-col gap-2">
        <PageTitle>{t("title")}</PageTitle>
        <p className="text-muted-foreground">{t("intro", { count: list.packages.length, agency: list.agency.name })}</p>
        {list.agency.about !== "" && <p className="max-w-[65ch] whitespace-pre-line">{list.agency.about}</p>}
      </div>
      <PackageFilter list={list} />
    </PageFrame>
  );
}
