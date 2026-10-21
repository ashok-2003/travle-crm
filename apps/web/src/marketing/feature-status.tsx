// Whether something the public page promises works today or is coming: said plainly beside it, so an agency never
// buys a feature that isn't there yet. Flip an item to live when its release ships.
import { useTranslations } from "next-intl";
import { StatusBadge } from "@/components/status-badge";

export type Availability = "live" | "soon";

export function FeatureStatus({ availability }: { availability: Availability }) {
  const t = useTranslations("marketing.status");
  return <StatusBadge tone={availability === "live" ? "good" : "neutral"}>{t(availability)}</StatusBadge>;
}
