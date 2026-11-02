// /a/<sign-in code>/...: an agency's public package pages (release 7b). Server-rendered so a link preview and a search engine
// read them; the root layout's providers are left out of /a (lib/routes.ts isPublicFormPath), and the page carries only the
// words its own parts need, the website form's sentences for a refusal among them.
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { messages } from "@/i18n/messages";

const pageMessages = {
  packagePages: messages.packagePages,
  websiteForm: messages.websiteForm,
  errors: messages.errors,
  forms: messages.forms,
};

export default function PackagePagesLayout({ children }: { children: ReactNode }) {
  return <NextIntlClientProvider messages={pageMessages}>{children}</NextIntlClientProvider>;
}
