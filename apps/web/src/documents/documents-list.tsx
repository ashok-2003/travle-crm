"use client";

// The issued documents (DESIGN.md section 6): a table on tablets and wider, newest first, numbers and times mono; a
// list of items on phones with the number and status on the first line, the document and when it was issued on the
// second (the time reads as prose there, as a file's day does), and the actions under them.
import type { IssuedDocumentSummary } from "@travel-crm/contracts/documents";
import { useTranslations } from "next-intl";
import { Fragment } from "react";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDayTime } from "@/lib/format";
import { useWideScreen } from "@/lib/use-wide-screen";
import { useMe } from "@/session/me-context";
import { DocumentActions } from "./document-actions";
import { DocumentStatus } from "./document-status";

export function DocumentsList({ documents }: { documents: IssuedDocumentSummary[] }) {
  const t = useTranslations("documents");
  const { timeZone } = useMe().organization;
  const wide = useWideScreen();
  const issued = (document: IssuedDocumentSummary) => formatDayTime(new Date(document.issuedAt), { timeZone });

  if (!wide) {
    return (
      <ItemGroup>
        {documents.map((document, index) => (
          <Fragment key={document.id}>
            {index > 0 && <ItemSeparator />}
            <Item size="sm" role="listitem" className="items-start">
              <ItemContent className="min-w-0">
                <ItemTitle className="flex-wrap">
                  <span className="numbers">{document.number}</span>
                  <DocumentStatus document={document} />
                </ItemTitle>
                <ItemDescription className="break-words script-leading">
                  {document.title} · {t(`templates.${document.template}`)} · {issued(document)}
                </ItemDescription>
              </ItemContent>
              <ItemActions className="basis-full">
                <DocumentActions document={document} />
              </ItemActions>
            </Item>
          </Fragment>
        ))}
      </ItemGroup>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">{t("list.columns.number")}</TableHead>
          <TableHead scope="col">{t("list.columns.document")}</TableHead>
          <TableHead scope="col" className="text-right">
            {t("list.columns.issued")}
          </TableHead>
          <TableHead scope="col">{t("list.columns.status")}</TableHead>
          <TableHead scope="col">
            <span className="sr-only">{t("list.columns.actions")}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {documents.map((document) => (
          <TableRow key={document.id}>
            <TableCell className="numbers">{document.number}</TableCell>
            <TableCell className="whitespace-normal script-leading">
              {document.title}{" "}
              <span className="text-label text-muted-foreground">{t(`templates.${document.template}`)}</span>
            </TableCell>
            <TableCell className="numbers text-right">{issued(document)}</TableCell>
            <TableCell>
              <DocumentStatus document={document} />
            </TableCell>
            <TableCell className="text-right">
              <DocumentActions document={document} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
