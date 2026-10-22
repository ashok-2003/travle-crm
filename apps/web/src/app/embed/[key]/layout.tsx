// /embed/<key>: the enquiry form for an iframe on the agency's own site. It has no background of its own, so it takes the
// look of the page around it, and is never indexed. The title is the generic one: the form sets the agency's own once it
// has loaded (use-document-title.ts), so no server call costs a page view. It carries only the form's own words (form-messages.ts).
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { formMessages } from "@/website-form/form-messages";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("websiteForm.page");
  return { title: { absolute: t("genericTitle") }, robots: { index: false, follow: false } };
}

export default function EmbeddedFormLayout({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider messages={formMessages}>
      <style>{"body{background:transparent}"}</style>
      {children}
    </NextIntlClientProvider>
  );
}
