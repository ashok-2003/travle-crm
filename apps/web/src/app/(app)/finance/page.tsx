// /finance: the agency's money (step 6, P0): profit, bookings and running costs, for whoever keeps its accounts.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { FinanceScreen } from "@/finance/finance-screen";
import { RequirePermission } from "@/session/require-permission";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("finance");
  return { title: t("title") };
}

export default function FinancePage() {
  return (
    <RequirePermission permission="accounts:view">
      <FinanceScreen />
    </RequirePermission>
  );
}
