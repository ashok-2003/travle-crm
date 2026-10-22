// /f/<key>: the hosted enquiry form's layout. The page is never indexed. The title is the generic
// one: the form sets the agency's own once it has loaded (use-document-title.ts), so no server call costs a page view.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("websiteForm.page");
  return { title: { absolute: t("genericTitle") }, robots: { index: false, follow: false } };
}

export default function FormLayout({ children }: { children: ReactNode }) {
  return children;
}
