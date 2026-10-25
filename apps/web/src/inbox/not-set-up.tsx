"use client";

// The sentence for an agency whose WhatsApp number is not connected (spec 3.1): it asks them to contact us, with the
// product's own support contact, and never names MSG91.
import { brand } from "@travel-crm/brand";
import { MessageCircleOffIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/empty-state";

export function NotSetUp({ scope = "inbox" }: { scope?: "inbox" | "inbox.settings" }) {
  const t = useTranslations(scope);
  const contact = brand.supportEmail;
  return <EmptyState icon={MessageCircleOffIcon} message={t("notSetUp", { contact })} />;
}
