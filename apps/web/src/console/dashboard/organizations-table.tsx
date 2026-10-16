"use client";

// The dashboard's organizations on tablets and wider (DESIGN.md section 6): a table, numbers mono and right-aligned,
// each organization's name leading to its page. Names wrap rather than being cut off.
import type { OrganizationOverview } from "@travel-crm/contracts/platform";
import { useTranslations } from "next-intl";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { consoleRoutes } from "../routes";
import { SubscriptionStatusBadge } from "../subscription-status";
import { useOverviewFigures } from "./overview-figures";
import { TextLink } from "@/components/text-link";

export function OrganizationsTable({ organizations }: { organizations: OrganizationOverview[] }) {
  const t = useTranslations("console.dashboard");
  const figuresOf = useOverviewFigures();
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">{t("columns.organization")}</TableHead>
          <TableHead scope="col">{t("columns.status")}</TableHead>
          <TableHead scope="col" className="text-right">
            {t("columns.daysLeft")}
          </TableHead>
          <TableHead scope="col" className="text-right">
            {t("columns.seats")}
          </TableHead>
          <TableHead scope="col" className="text-right">
            {t("columns.lastActive")}
          </TableHead>
          <TableHead scope="col" className="text-right">
            {t("columns.changes")}
          </TableHead>
          <TableHead scope="col" className="text-right">
            {t("columns.documents")}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {organizations.map((organization) => {
          const figures = figuresOf(organization);
          return (
            <TableRow key={organization.organizationId}>
              <TableCell className="whitespace-normal">
                <div className="flex flex-col">
                  <TextLink href={consoleRoutes.organization(organization.organizationId)}>
                    <span className="script-leading">{organization.name}</span>
                  </TextLink>
                  <span className="text-caption text-muted-foreground">
                    <span className="numbers">{organization.code}</span>
                    {organization.planName !== null && ` · ${organization.planName}`}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <SubscriptionStatusBadge status={organization.status} />
              </TableCell>
              <TableCell className="text-right">{figures.daysLeft}</TableCell>
              <TableCell className="text-right">{figures.seats}</TableCell>
              <TableCell className="text-right">{figures.lastActive}</TableCell>
              <TableCell className="text-right">{figures.changes}</TableCell>
              <TableCell className="text-right">{figures.documents}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
