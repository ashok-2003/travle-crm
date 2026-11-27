// A trip's days as a vertical flow: each day a box in the plan's light sky tint (as on the customer's page and the PDF),
// a decorative arrow down between them. Shared by the opened quote, the trip page and the public package page, so it
// needs only next-intl.
import { ArrowDownIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Fragment } from "react";
import { cardTints } from "@/components/card-tints";
import { cn } from "@/lib/utils";

export interface PlanDay {
  title: string;
  description: string;
}

export function DayBoxes({ days }: { days: readonly PlanDay[] }) {
  const t = useTranslations("tripPlan");
  if (days.length === 0) return null;
  return (
    <ol className="flex flex-col gap-1">
      {days.map((day, index) => (
        <Fragment key={`${String(index)}-${day.title}`}>
          {index > 0 && (
            <li aria-hidden="true" className="flex justify-center text-muted-foreground">
              <ArrowDownIcon data-slot="day-arrow" className="size-5" />
            </li>
          )}
          <li className={cn("flex flex-col gap-1 rounded-lg p-4", cardTints.sky)}>
            <p className="font-semibold">
              {day.title === "" ? t("dayUntitled", { day: index + 1 }) : t("day", { day: index + 1, title: day.title })}
            </p>
            {day.description !== "" && <p className="whitespace-pre-line">{day.description}</p>}
          </li>
        </Fragment>
      ))}
    </ol>
  );
}
