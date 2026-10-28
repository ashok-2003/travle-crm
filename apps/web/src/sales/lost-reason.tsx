"use client";

// Why a lead was lost (sales execution), asked when it is moved to Lost: the price, the dates, a competitor, no reply,
// changed plans, or something else. It says what to fix, and whom to win back with a broadcast later.
import { lostReasons, type LostReason } from "@travel-crm/contracts/crm";
import { useTranslations } from "next-intl";
import { ChoiceGroup } from "@/components/forms/choice-field";

export function LostReasonChoice({
  value,
  onChange,
}: {
  value: LostReason | null;
  onChange: (reason: LostReason) => void;
}) {
  const t = useTranslations("sales.lost");
  return (
    <ChoiceGroup
      legend={t("why")}
      value={value ?? ""}
      onChange={(chosen) => {
        const reason = lostReasons.find((one) => one === chosen);
        if (reason !== undefined) onChange(reason);
      }}
      options={lostReasons.map((reason) => ({ value: reason, label: t(`reasons.${reason}`) }))}
    />
  );
}
