// The Foundation's one template (spec 9.3): a titled document with a recipient, rows with amounts, totals, notes and
// the organization's terms. Real templates (quotes, invoices) follow its layout.
// Written with createElement rather than JSX: dependency-cruiser's resolver doesn't follow imports of .tsx files.
import { Document, Page, StyleSheet, Text, View, type DocumentProps } from "@react-pdf/renderer";
import { brand } from "@travel-crm/brand";
import { createElement, type ReactElement } from "react";
import type { PdfInput, SampleDocumentData } from "../document-input.js";
import { pageFooter, pageHeader } from "../page-parts.js";
import { pdfTheme, type PdfTheme } from "../theme.js";

function styles(theme: PdfTheme) {
  return StyleSheet.create({
    page: { paddingTop: 36, paddingHorizontal: 40, paddingBottom: 64, fontFamily: theme.fonts.ui, fontSize: 10 },
    label: { fontSize: 8, color: theme.muted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 3 },
    recipient: { marginBottom: 18 },
    recipientName: { fontSize: 11, fontWeight: 600, color: theme.ink },
    line: { color: theme.ink },
    tableHead: {
      flexDirection: "row",
      backgroundColor: theme.surface,
      borderBottomWidth: 0.5,
      borderBottomColor: theme.hairline,
      paddingVertical: 5,
      paddingHorizontal: 6,
      fontSize: 8,
      color: theme.muted,
    },
    row: {
      flexDirection: "row",
      borderBottomWidth: 0.5,
      borderBottomColor: theme.hairline,
      paddingVertical: 6,
      paddingHorizontal: 6,
    },
    // flexBasis 0: the description takes only the room the amount leaves, however long its text.
    description: { flexGrow: 1, flexShrink: 1, flexBasis: 0, paddingRight: 12 },
    detail: { fontSize: 8, color: theme.muted, marginTop: 2 },
    // Wide enough for ₹99,99,99,999.00 on one line, and never squeezed by a long description.
    amountHead: { width: 120, flexShrink: 0, textAlign: "right" },
    amount: { width: 120, flexShrink: 0, textAlign: "right", fontFamily: theme.fonts.numbers, color: theme.ink },
    totals: { marginTop: 10, alignSelf: "flex-end", width: 260 },
    total: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3, paddingHorizontal: 6 },
    totalEmphasis: { borderTopWidth: 1, borderTopColor: theme.ink, marginTop: 3, paddingTop: 6 },
    totalLabel: { color: theme.muted },
    totalLabelEmphasis: { color: theme.ink, fontWeight: 600 },
    totalAmount: { fontFamily: theme.fonts.numbers, color: theme.ink },
    totalAmountEmphasis: { fontFamily: theme.fonts.numbers, color: theme.money, fontWeight: 600 },
    section: { marginTop: 20 },
    paragraph: { color: theme.ink, lineHeight: 1.4 },
  });
}

type Styles = ReturnType<typeof styles>;

function recipient(style: Styles, { name, lines }: SampleDocumentData["recipient"]): ReactElement {
  return createElement(
    View,
    { style: style.recipient },
    createElement(Text, { style: style.label }, "Prepared for"),
    createElement(Text, { style: style.recipientName }, name),
    ...lines.map((line, index) => createElement(Text, { key: index, style: style.line }, line)),
  );
}

function table(style: Styles, rows: SampleDocumentData["rows"]): ReactElement[] {
  const head = createElement(
    View,
    { key: "head", style: style.tableHead },
    createElement(Text, { style: style.description }, "Description"),
    createElement(Text, { style: style.amountHead }, "Amount"),
  );
  const body = rows.map((row, index) =>
    // wrap: false keeps a row on one page.
    createElement(
      View,
      { key: index, style: style.row, wrap: false },
      createElement(
        View,
        { style: style.description },
        createElement(Text, null, row.description),
        row.detail ? createElement(Text, { style: style.detail }, row.detail) : null,
      ),
      createElement(Text, { style: style.amount }, row.amount),
    ),
  );
  return [head, ...body];
}

function totals(style: Styles, lines: SampleDocumentData["totals"]): ReactElement {
  return createElement(
    View,
    { style: style.totals, wrap: false },
    ...lines.map((total, index) =>
      createElement(
        View,
        { key: index, style: total.emphasis ? [style.total, style.totalEmphasis] : style.total },
        createElement(Text, { style: total.emphasis ? style.totalLabelEmphasis : style.totalLabel }, total.label),
        createElement(Text, { style: total.emphasis ? style.totalAmountEmphasis : style.totalAmount }, total.amount),
      ),
    ),
  );
}

function section(style: Styles, label: string, text: string | undefined): ReactElement | null {
  if (!text) return null;
  return createElement(
    View,
    { style: style.section },
    createElement(Text, { style: style.label }, label),
    createElement(Text, { style: style.paragraph }, text),
  );
}

export function sampleDocument({ data, branding, issuedAt }: PdfInput): ReactElement<DocumentProps> {
  const theme = pdfTheme(branding);
  const style = styles(theme);
  return createElement(
    Document,
    {
      title: `${data.title} ${data.number}`,
      author: branding.organizationName,
      creator: brand.productName,
      producer: brand.productName,
      creationDate: issuedAt,
      modificationDate: issuedAt,
    },
    createElement(
      Page,
      { size: "A4", style: style.page },
      pageHeader({ branding, theme, title: data.title, number: data.number, issuedOn: data.issuedOn }),
      recipient(style, data.recipient),
      ...table(style, data.rows),
      totals(style, data.totals),
      section(style, "Notes", data.notes),
      section(style, "Terms", branding.terms),
      pageFooter({ branding, theme }),
    ),
  );
}
