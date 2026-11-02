// /a/<sign-in code>/<package>: one published package, with its photos, plan, dates and an enquiry form (release 7b).
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageFailed } from "@/package-pages/failed";
import { loadPackagePage } from "@/package-pages/load-page";
import { PackageView } from "@/package-pages/package-view";

export async function generateMetadata({ params }: PageProps<"/a/[code]/[slug]">): Promise<Metadata> {
  const { code, slug } = await params;
  const loaded = await loadPackagePage(code, slug);
  if (loaded.state !== "ready") return { robots: { index: false, follow: false } };
  const { agency, package: trip } = loaded.page;
  const t = await getTranslations("packagePages.page");
  const title = t("metaTitle", { name: trip.name, agency: agency.name });
  const image = trip.photos[0]?.url;
  return {
    title: { absolute: title },
    description: trip.summary,
    openGraph: {
      title,
      description: trip.summary,
      siteName: agency.name,
      type: "website",
      ...(image === undefined ? {} : { images: [{ url: image }] }),
    },
    twitter: { card: image === undefined ? "summary" : "summary_large_image", title, description: trip.summary },
  };
}

export default async function PackagePublicPage({ params }: PageProps<"/a/[code]/[slug]">) {
  const { code, slug } = await params;
  const loaded = await loadPackagePage(code, slug);
  if (loaded.state === "not-found") notFound();
  if (loaded.state === "failed") return <PageFailed href={`/a/${code}/${slug}`} />;
  return <PackageView page={loaded.page} />;
}
