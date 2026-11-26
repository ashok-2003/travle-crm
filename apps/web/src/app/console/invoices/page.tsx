// /console/invoices: the invoices a super admin makes by hand.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { InvoicesScreen } from "@/console/invoices/invoices-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("consoleInvoices.invoices");
  return { title: t("title") };
}

export default function ConsoleInvoicesPage() {
  return <InvoicesScreen />;
}
