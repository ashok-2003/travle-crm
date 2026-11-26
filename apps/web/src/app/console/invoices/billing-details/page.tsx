// /console/invoices/billing-details: the firm's details every invoice carries.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BillingDetailsScreen } from "@/console/invoices/billing-details-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("consoleInvoices.billingDetails");
  return { title: t("title") };
}

export default function ConsoleBillingDetailsPage() {
  return <BillingDetailsScreen />;
}
