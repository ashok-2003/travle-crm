// The top of an agency's public pages (release 7b): its logo and name, and the way to all its packages. Server-rendered.
import type { PublicAgency } from "@travel-crm/contracts/package-pages";
import { getTranslations } from "next-intl/server";
import { TextLink } from "@/components/text-link";
import { AgencyMark } from "@/website-form/agency-mark";

export async function AgencyHeader({ agency, withList }: { agency: PublicAgency; withList: boolean }) {
  const t = await getTranslations("packagePages.page");
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <AgencyMark name={agency.name} logoUrl={agency.logoUrl} />
      {withList && <TextLink href={`/a/${agency.code}`}>{t("allPackages")}</TextLink>}
    </header>
  );
}
