"use client";

// The connected sheets: a registry Table on a computer (sheet, tab, last checked, state) and an ItemGroup on a phone,
// each sheet's name linking to its page, or, while it is still being set up, to the step it stopped at.
import type { SheetListItem } from "@travel-crm/contracts/sheets";
import { useTranslations } from "next-intl";
import { Fragment } from "react";
import { TextLink } from "@/components/text-link";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemSeparator, ItemTitle } from "@/components/ui/item";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { sheetConnectStepRoute, sheetRoute } from "@/lib/routes";
import { useWideScreen } from "@/lib/use-wide-screen";
import { useMe } from "@/session/me-context";
import { lastCheckedText } from "./last-checked";
import { SheetStatusBadge } from "./sheet-status-badge";

const hrefOf = (sheet: SheetListItem) =>
  sheet.status === "connecting" ? sheetConnectStepRoute(sheet.id) : sheetRoute(sheet.id);

/** A sheet's last check as the agency's clock shows it ("10:42", "18 Oct, 10:42"), or that there was none yet. */
function useLastChecked() {
  const t = useTranslations("sheets.list");
  const { timeZone } = useMe().organization;
  return (sheet: SheetListItem): string =>
    sheet.lastCheckedAt === null ? t("notChecked") : lastCheckedText(new Date(sheet.lastCheckedAt), { timeZone });
}

export function SheetList({ items }: { items: readonly SheetListItem[] }) {
  const t = useTranslations("sheets.list");
  const wide = useWideScreen();
  const lastChecked = useLastChecked();

  if (!wide) {
    return (
      <ItemGroup aria-label={t("listLabel")}>
        {items.map((sheet, index) => (
          <Fragment key={sheet.id}>
            {index > 0 && <ItemSeparator />}
            <Item size="sm" role="listitem" className="items-start">
              <ItemContent className="min-w-0">
                <ItemTitle className="flex-wrap wrap-anywhere script-leading">
                  <TextLink href={hrefOf(sheet)} inline>
                    {sheet.sheetTitle}
                  </TextLink>
                </ItemTitle>
                <ItemDescription className="wrap-anywhere script-leading">
                  {sheet.tabTitle} ·{" "}
                  {sheet.lastCheckedAt === null ? lastChecked(sheet) : t("lastChecked", { when: lastChecked(sheet) })}
                </ItemDescription>
              </ItemContent>
              <SheetStatusBadge status={sheet.status} />
            </Item>
          </Fragment>
        ))}
      </ItemGroup>
    );
  }

  return (
    <Table aria-label={t("listLabel")}>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">{t("columns.sheet")}</TableHead>
          <TableHead scope="col">{t("columns.tab")}</TableHead>
          <TableHead scope="col">{t("columns.lastChecked")}</TableHead>
          <TableHead scope="col">{t("columns.state")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((sheet) => (
          <TableRow key={sheet.id}>
            <TableCell className="whitespace-normal wrap-anywhere font-medium">
              <TextLink href={hrefOf(sheet)} inline>
                {sheet.sheetTitle}
              </TextLink>
            </TableCell>
            <TableCell className="whitespace-normal wrap-anywhere text-muted-foreground">{sheet.tabTitle}</TableCell>
            <TableCell className="numbers text-muted-foreground">{lastChecked(sheet)}</TableCell>
            <TableCell>
              <SheetStatusBadge status={sheet.status} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
