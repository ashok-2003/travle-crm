"use client";

// The dashboard's organizations on tablets and wider (DESIGN.md section 6): a table, numbers mono and right-aligned,
// each organization's name leading to its page. Names wrap rather than being cut off.
import type { OrganizationOverview } from "@travel-crm/contracts/platform";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { consoleRoutes } from "../routes";
import { SubscriptionStatusBadge } from "../subscription-status";
import { useOverviewFigures } from "./overview-figures";

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
                <Link
                  href={consoleRoutes.organization(organization.organizationId)}
                  className="flex flex-col py-1 hover:underline"
                >
                  <span className="font-medium text-primary script-leading">{organization.name}</span>
                  <span className="text-caption text-muted-foreground">
                    <span className="numbers">{organization.code}</span>
                    {organization.planName !== null && ` · ${organization.planName}`}
                  </span>
                </Link>
              </TableCell>
              <TableCell>
                <SubscriptionStatusBadge status={organization.status} />
              </TableCell>
              <TableCell className="numbers text-right">{figures.daysLeft}</TableCell>
              <TableCell className="numbers text-right">{figures.seats}</TableCell>
              <TableCell className="numbers text-right">{figures.lastActive}</TableCell>
              <TableCell className="numbers text-right">{figures.changes}</TableCell>
              <TableCell className="numbers text-right">{figures.documents}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
