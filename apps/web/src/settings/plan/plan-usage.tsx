// What the plan includes beside the use so far: team members, WhatsApp numbers, storage and this month's AI credits,
// each "used of limit".
import type { BillingView } from "@travel-crm/contracts/subscriptions";
import { useTranslations } from "next-intl";
import { Details } from "@/components/details";
import { formatFileSize } from "@/files/file-size";
import { formatCount } from "@/lib/format";

export function PlanUsage({ billing }: { billing: BillingView }) {
  const t = useTranslations("planBilling.usage");
  const counts = (use: { used: number; limit: number }) =>
    t("usedOf", { used: formatCount(use.used), limit: formatCount(use.limit) });
  return (
    <section aria-labelledby="plan-usage-heading" className="flex flex-col gap-3">
      <h2 id="plan-usage-heading" className="text-section font-semibold">
        {t("heading")}
      </h2>
      <Details
        rows={[
          { label: t("seats"), value: counts(billing.seats) },
          { label: t("whatsappNumbers"), value: counts(billing.whatsappNumbers) },
          {
            label: t("storage"),
            value: t("usedOf", {
              used: formatFileSize(billing.storageBytes.used),
              limit: formatFileSize(billing.storageBytes.limit),
            }),
          },
          { label: t("aiCredits"), value: counts(billing.aiCredits), info: t("aiCreditsInfo") },
        ]}
      />
    </section>
  );
}
