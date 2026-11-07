// /payments: the payments that wait for a person to check them (plan 3). For whoever sees bookings and records payments.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PaymentsScreen } from "@/payments/payments-screen";
import { RequirePermission } from "@/session/require-permission";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("payments");
  return { title: t("title") };
}

export default function PaymentsPage() {
  return (
    <RequirePermission permission="bookings:view">
      <RequirePermission permission="quotes:record_payments">
        <PaymentsScreen />
      </RequirePermission>
    </RequirePermission>
  );
}
