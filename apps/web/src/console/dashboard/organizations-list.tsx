"use client";

// The dashboard's organizations on phones (DESIGN.md section 6): a divided list, each organization leading to its
// page, with its name and status on the first line and its figures below. Names wrap rather than being cut off.
import type { OrganizationOverview } from "@travel-crm/contracts/platform";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { consoleRoutes } from "../routes";
import { SubscriptionStatusBadge } from "../subscription-status";
import { useOverviewFigures, type OverviewFigures } from "./overview-figures";

const FIGURES: readonly (keyof OverviewFigures)[] = ["daysLeft", "seats", "lastActive", "changes", "documents"];

export function OrganizationsList({ organizations }: { organizations: OrganizationOverview[] }) {
  const t = useTranslations("console.dashboard");
  const figuresOf = useOverviewFigures();
  return (
    <ul className="divide-y rounded-lg border">
      {organizations.map((organization) => {
        const figures = figuresOf(organization);
        return (
          <li key={organization.organizationId}>
            <Link
              href={consoleRoutes.organization(organization.organizationId)}
              className="flex flex-col gap-1 px-4 py-3 hover:bg-accent"
            >
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-primary break-words script-leading">{organization.name}</span>
                <SubscriptionStatusBadge status={organization.status} />
              </span>
              <span className="text-caption text-muted-foreground">
                <span className="numbers">{organization.code}</span>
                {organization.planName !== null && ` · ${organization.planName}`}
              </span>
              <span className="flex flex-wrap gap-x-4 gap-y-1 text-label">
                {FIGURES.map((figure) => (
                  <span key={figure}>
                    <span className="text-muted-foreground">{t(`columns.${figure}`)}</span>{" "}
                    <span className="numbers">{figures[figure]}</span>
                  </span>
                ))}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
