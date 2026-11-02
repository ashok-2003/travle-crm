// /console/emails/<id>: one email as it was sent, and sending it again (the failed-emails spec). The server reads only
// the id, never the email.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EmailScreen } from "@/console/emails/email-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("consolePlatform.emails");
  return { title: t("title") };
}

export default async function ConsoleEmailPage({ params }: PageProps<"/console/emails/[emailId]">) {
  const { emailId } = await params;
  return <EmailScreen emailId={emailId} />;
}
