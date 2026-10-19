"use client";

// Recent imports (spec 3.2 step 1, D6): the person's last ten of the kind, each with its file name linking to its
// page, the day it was started ("16 Oct"), its rows and how many were added, and its state as a badge. Nothing shows
// when there are none.
import type { RecentImport } from "@travel-crm/contracts/imports";
import { useTranslations } from "next-intl";
import { Fragment, useId } from "react";
import { TextLink } from "@/components/text-link";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";
import { formatCount, formatDay } from "@/lib/format";
import { useMe } from "@/session/me-context";
import { ImportStatusBadge } from "./import-status-badge";

export function RecentImports({
  imports,
  hrefOf,
}: {
  imports: readonly RecentImport[];
  hrefOf: (importId: string) => string;
}) {
  const t = useTranslations("imports.recent");
  const { timeZone } = useMe().organization;
  const headingId = useId();
  if (imports.length === 0) return null;
  return (
    <section className="flex flex-col gap-2" aria-labelledby={headingId}>
      <h2 id={headingId} className="text-section font-semibold">
        {t("title")}
      </h2>
      <ItemGroup>
        {imports.map((item, index) => (
          <Fragment key={item.id}>
            {index > 0 && <ItemSeparator />}
            <Item size="sm" role="listitem">
              <ItemContent>
                <ItemTitle className="wrap-anywhere">
                  <TextLink href={hrefOf(item.id)} inline>
                    {item.fileName}
                  </TextLink>
                </ItemTitle>
                <ItemDescription className="flex flex-wrap gap-x-2">
                  <span>{formatDay(new Date(item.createdAt), { timeZone })}</span>
                  <span aria-hidden="true">·</span>
                  <span className="numbers">
                    {t("rows", {
                      rows: item.rowsTotal,
                      total: formatCount(item.rowsTotal),
                      added: formatCount(item.rowsAdded),
                    })}
                  </span>
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <ImportStatusBadge status={item.status} />
              </ItemActions>
            </Item>
          </Fragment>
        ))}
      </ItemGroup>
    </section>
  );
}
