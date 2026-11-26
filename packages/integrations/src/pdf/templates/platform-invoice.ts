// The platform's invoice to an agency: the product's brand, the firm and the billed company, rows, totals, how to pay.
// Written with createElement rather than JSX: dependency-cruiser's resolver doesn't follow imports of .tsx files.
import { Document, Page, StyleSheet, Text, View, type DocumentProps } from "@react-pdf/renderer";
import { brand } from "@travel-crm/brand";
import { createElement, type ReactElement } from "react";
import { pageFooter } from "../page-parts.js";
import type { PlatformInvoiceData } from "../platform-invoice-input.js";
import { pdfTheme, type PdfTheme } from "../theme.js";

function styles(theme: PdfTheme) {
  return StyleSheet.create({
    page: { paddingTop: 36, paddingHorizontal: 40, paddingBottom: 64, fontFamily: theme.fonts.ui, fontSize: 10 },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-end",
      paddingBottom: 10,
      marginBottom: 18,
      borderBottomWidth: 2,
      borderBottomColor: theme.accent,
    },
    product: { fontFamily: theme.fonts.title, fontSize: 18, fontWeight: 600, color: theme.ink },
    heading: { alignItems: "flex-end" },
    title: { fontFamily: theme.fonts.title, fontSize: 20, fontWeight: 600, color: theme.accent },
    reference: { fontFamily: theme.fonts.numbers, fontSize: 9, color: theme.muted, marginTop: 2 },
    parties: { flexDirection: "row", gap: 24, marginBottom: 18 },
    party: { flexGrow: 1, flexBasis: 0 },
    label: { fontSize: 8, color: theme.muted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 3 },
    partyName: { fontSize: 11, fontWeight: 600, color: theme.ink },
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
    amountHead: { width: 120, flexShrink: 0, textAlign: "right" },
    amount: { width: 120, flexShrink: 0, textAlign: "right", fontFamily: theme.fonts.numbers, color: theme.ink },
    totals: { marginTop: 10, alignSelf: "flex-end", width: 260 },
    total: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3, paddingHorizontal: 6 },
    totalEmphasis: { borderTopWidth: 1, borderTopColor: theme.ink, marginTop: 3, paddingTop: 6 },
    totalLabel: { color: theme.muted },
    totalLabelEmphasis: { color: theme.ink, fontWeight: 600 },
    totalAmount: { fontFamily: theme.fonts.numbers, color: theme.ink },
    totalAmountEmphasis: { fontFamily: theme.fonts.numbers, color: theme.money, fontWeight: 600 },
    section: { marginTop: 18 },
    paragraph: { color: theme.ink, lineHeight: 1.4 },
    payBox: { marginTop: 18, padding: 10, backgroundColor: theme.surface },
    signatory: { marginTop: 36, alignSelf: "flex-end", width: 200 },
    signLine: { marginTop: 28, paddingTop: 4, borderTopWidth: 0.5, borderTopColor: theme.ink, color: theme.muted },
  });
}

type Styles = ReturnType<typeof styles>;

function header(style: Styles, data: PlatformInvoiceData): ReactElement {
  const dates = [`Date: ${data.issuedOn}`, ...(data.dueOn ? [`Due: ${data.dueOn}`] : [])];
  return createElement(
    View,
    { style: style.header, fixed: true },
    createElement(Text, { style: style.product }, brand.productName),
    createElement(
      View,
      { style: style.heading },
      createElement(Text, { style: style.title }, data.title),
      createElement(Text, { style: style.reference }, data.number),
      ...dates.map((date) => createElement(Text, { key: date, style: style.reference }, date)),
    ),
  );
}

function party(style: Styles, label: string, { name, lines }: PlatformInvoiceData["seller"]): ReactElement {
  return createElement(
    View,
    { style: style.party },
    createElement(Text, { style: style.label }, label),
    createElement(Text, { style: style.partyName }, name),
    ...lines.map((line, index) => createElement(Text, { key: index, style: style.line }, line)),
  );
}

function table(style: Styles, rows: PlatformInvoiceData["rows"]): ReactElement[] {
  const head = createElement(
    View,
    { key: "head", style: style.tableHead },
    createElement(Text, { style: style.description }, "Description"),
    createElement(Text, { style: style.amountHead }, "Amount"),
  );
  // wrap: false keeps a row on one page.
  const body = rows.map((row, index) =>
    createElement(
      View,
      { key: index, style: style.row, wrap: false },
      createElement(Text, { style: style.description }, row.description),
      createElement(Text, { style: style.amount }, row.amount),
    ),
  );
  return [head, ...body];
}

function totals(style: Styles, lines: PlatformInvoiceData["totals"]): ReactElement {
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

function section(style: Styles, label: string, lines: readonly string[]): ReactElement {
  return createElement(
    View,
    { style: style.section, wrap: false },
    createElement(Text, { style: style.label }, label),
    ...lines.map((line, index) => createElement(Text, { key: index, style: style.paragraph }, line)),
  );
}

function howToPay(style: Styles, lines: readonly string[]): ReactElement {
  return createElement(
    View,
    { style: style.payBox, wrap: false },
    createElement(Text, { style: style.label }, "How to pay"),
    ...lines.map((line, index) => createElement(Text, { key: index, style: style.paragraph }, line)),
  );
}

export function platformInvoice(data: PlatformInvoiceData, issuedAt: Date): ReactElement<DocumentProps> {
  const theme = pdfTheme({ organizationName: data.seller.name });
  const style = styles(theme);
  return createElement(
    Document,
    {
      title: `${data.title} ${data.number}`,
      author: data.seller.name,
      creator: brand.productName,
      producer: brand.productName,
      creationDate: issuedAt,
      modificationDate: issuedAt,
    },
    createElement(
      Page,
      { size: "A4", style: style.page },
      header(style, data),
      createElement(
        View,
        { style: style.parties },
        party(style, "From", data.seller),
        party(style, "Billed to", data.billTo),
      ),
      ...table(style, data.rows),
      totals(style, data.totals),
      section(style, "Amount in words", [data.totalInWords]),
      data.payment ? howToPay(style, data.payment.lines) : null,
      data.notes ? section(style, "Notes", [data.notes]) : null,
      createElement(
        View,
        { style: style.signatory, wrap: false },
        createElement(Text, { style: style.paragraph }, data.signatory),
        createElement(Text, { style: style.signLine }, "Authorised signatory"),
      ),
      pageFooter({ branding: { organizationName: data.seller.name }, theme }),
    ),
  );
}
