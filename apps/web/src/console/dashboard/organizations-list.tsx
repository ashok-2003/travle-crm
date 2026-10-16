"use client";

// The dashboard's organizations on phones (DESIGN.md section 6): a list of items, each organization leading to its
// page, with its name and status on the first line and its key figures, days left and seats, below; the table and the
// organization's page have the rest. Names wrap rather than being cut off.
import type { OrganizationOverview } from "@travel-crm/contracts/platform";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Fragment } from "react";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemSeparator, ItemTitle } from "@/components/ui/item";
import { consoleRoutes } from "../routes";
import { SubscriptionStatusBadge } from "../subscription-status";
import { useOverviewFigures, type OverviewFigures } from "./overview-figures";

const FIGURES: readonly (keyof OverviewFigures)[] = ["daysLeft", "seats"];

export function OrganizationsList({ organizations }: { organizations: OrganizationOverview[] }) {
  const t = useTranslations("console.dashboard");
  const figuresOf = useOverviewFigures();
  return (
    <ItemGroup>
      {organizations.map((organization, index) => {
        const figures = figuresOf(organization);
        return (
          <Fragment key={organization.organizationId}>
            {index > 0 && <ItemSeparator />}
            <div role="listitem">
              <Item size="sm" asChild>
                <Link href={consoleRoutes.organization(organization.organizationId)}>
                  <ItemContent>
                    <ItemTitle className="flex-wrap">
                      <span className="wrap-anywhere script-leading">{organization.name}</span>
                      <SubscriptionStatusBadge status={organization.status} />
                    </ItemTitle>
                    <ItemDescription>
                      <span className="numbers">{organization.code}</span>
                      {organization.planName !== null && ` · ${organization.planName}`}
                    </ItemDescription>
                    <span className="flex flex-wrap gap-x-4 gap-y-1 text-label">
                      {FIGURES.map((figure) => (
                        <span key={figure}>
                          <span className="text-muted-foreground">{t(`columns.${figure}`)}</span>{" "}
                          <span>{figures[figure]}</span>
                        </span>
                      ))}
                    </span>
                  </ItemContent>
                </Link>
              </Item>
            </div>
          </Fragment>
        );
      })}
    </ItemGroup>
  );
}
