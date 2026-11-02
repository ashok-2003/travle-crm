// /a/<sign-in code>: an agency's published packages, searchable by place (release 7b).
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageFailed } from "@/package-pages/failed";
import { ListView } from "@/package-pages/list-view";
import { loadPackageList } from "@/package-pages/load-page";

export async function generateMetadata({ params }: PageProps<"/a/[code]">): Promise<Metadata> {
  const { code } = await params;
  const loaded = await loadPackageList(code);
  if (loaded.state !== "ready") return { robots: { index: false, follow: false } };
  const t = await getTranslations("packagePages.list");
  const title = t("metaTitle", { agency: loaded.page.agency.name });
  return { title: { absolute: title }, openGraph: { title, siteName: loaded.page.agency.name, type: "website" } };
}

export default async function AgencyPackagesPage({ params }: PageProps<"/a/[code]">) {
  const { code } = await params;
  const loaded = await loadPackageList(code);
  if (loaded.state === "not-found") notFound();
  if (loaded.state === "failed") return <PageFailed href={`/a/${code}`} />;
  return <ListView list={loaded.page} />;
}
