"use client";

// The packages list on a wide screen: the registry Table with each trip's From price, next departure, departures ahead and
// what needs attention.
import type { QuotePackage } from "@travel-crm/contracts/quotes";
import { useTranslations } from "next-intl";
import { rupees } from "@/components/forms/money-field";
import { TextLink } from "@/components/text-link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { packageRoute } from "@/lib/routes";
import { NextDeparture, PackageBadges, useKindWords } from "./package-list-words";
import { PackageRowMenu } from "./package-row-menu";
import type { AskToDelete } from "./packages-rows";

export function PackagesTable({
  packages,
  mayEdit,
  onDelete,
}: { packages: QuotePackage[]; mayEdit: boolean } & AskToDelete) {
  const t = useTranslations("packages.list");
  const kind = useKindWords();
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("columns.trip")}</TableHead>
          <TableHead>{t("columns.from")}</TableHead>
          <TableHead>{t("columns.next")}</TableHead>
          <TableHead>{t("columns.departures")}</TableHead>
          <TableHead>{t("columns.status")}</TableHead>
          {mayEdit && (
            <TableHead>
              <span className="sr-only">{t("columns.actions")}</span>
            </TableHead>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {packages.map((one) => (
          <TableRow key={one.id}>
            <TableCell>
              <div className="flex flex-col">
                {mayEdit ? (
                  <TextLink inline href={packageRoute(one.id)}>
                    {one.name}
                  </TextLink>
                ) : (
                  <span>{one.name}</span>
                )}
                <span className="text-caption text-muted-foreground">{kind(one)}</span>
              </div>
            </TableCell>
            <TableCell>
              {one.fromPricePaise !== null && <span className="numbers">{rupees(one.fromPricePaise)}</span>}
            </TableCell>
            <TableCell>
              <span className="numbers">
                <NextDeparture one={one} />
              </span>
            </TableCell>
            <TableCell>{one.kind === "group" && <span className="numbers">{one.departuresAhead}</span>}</TableCell>
            <TableCell>
              <div className="flex flex-wrap gap-1">
                <PackageBadges one={one} />
              </div>
            </TableCell>
            {mayEdit && (
              <TableCell>
                <PackageRowMenu one={one} onDelete={onDelete} />
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
