"use client";

// The issued documents (DESIGN.md section 6): a table on tablets and wider, newest first, numbers and times mono; a
// divided list on phones with the number and status on the first line and the document and time on the second.
import type { IssuedDocumentSummary } from "@travel-crm/contracts/documents";
import { useTranslations } from "next-intl";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDay, formatTime } from "@/lib/format";
import { useWideScreen } from "@/lib/use-wide-screen";
import { useMe } from "@/session/me-context";
import { DocumentActions } from "./document-actions";
import { DocumentStatus } from "./document-status";

export function DocumentsList({ documents }: { documents: IssuedDocumentSummary[] }) {
  const t = useTranslations("documents");
  const { timeZone } = useMe().organization;
  const wide = useWideScreen();
  const issued = (document: IssuedDocumentSummary) => {
    const at = new Date(document.issuedAt);
    return t("list.issuedAt", { day: formatDay(at, { timeZone }), time: formatTime(at, { timeZone }) });
  };

  if (!wide) {
    return (
      <ul className="divide-y rounded-lg border">
        {documents.map((document) => (
          <li key={document.id} className="flex items-start gap-3 px-4 py-3">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="numbers font-medium">{document.number}</span>
                <DocumentStatus document={document} />
              </div>
              <p className="text-label text-muted-foreground break-words script-leading">
                {document.title} · {t(`templates.${document.template}`)} ·{" "}
                <span className="numbers">{issued(document)}</span>
              </p>
            </div>
            <DocumentActions document={document} />
          </li>
        ))}
      </ul>
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
