// The platform's invoice to an agency: the firm's logo and name, the billed company, Qty × Rate rows, totals, how to pay,
// and the firm's signature block.
// Written with createElement rather than JSX: dependency-cruiser's resolver doesn't follow imports of .tsx files.
import { Document, Image, Page, StyleSheet, Text, View, type DocumentProps } from "@react-pdf/renderer";
import { brand } from "@travel-crm/brand";
import { createElement, type ReactElement } from "react";
import type { PlatformInvoiceData, PlatformInvoiceImage } from "../platform-invoice-input.js";
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
    firm: { flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 1 },
    logo: { maxHeight: 48, maxWidth: 120, objectFit: "contain" },
    firmName: { fontFamily: theme.fonts.title, fontSize: 18, fontWeight: 600, color: theme.ink, flexShrink: 1 },
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
    index: { width: 24, flexShrink: 0, fontFamily: theme.fonts.numbers, color: theme.muted },
    // flexBasis 0: the description takes only the room the numbers leave, however long its text.
    description: { flexGrow: 1, flexShrink: 1, flexBasis: 0, paddingRight: 12 },
    quantityHead: { width: 40, flexShrink: 0, textAlign: "right" },
    quantity: { width: 40, flexShrink: 0, textAlign: "right", fontFamily: theme.fonts.numbers, color: theme.ink },
    rateHead: { width: 90, flexShrink: 0, textAlign: "right" },
    rate: { width: 90, flexShrink: 0, textAlign: "right", fontFamily: theme.fonts.numbers, color: theme.ink },
    amountHead: { width: 100, flexShrink: 0, textAlign: "right" },
    amount: { width: 100, flexShrink: 0, textAlign: "right", fontFamily: theme.fonts.numbers, color: theme.ink },
    totals: { marginTop: 10, alignSelf: "flex-end", width: 260 },
    total: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3, paddingHorizontal: 6 },
    totalEmphasis: { borderTopWidth: 1, borderTopColor: theme.ink, marginTop: 3, paddingTop: 6 },
    totalLabel: { color: theme.muted },
    totalLabelEmphasis: { color: theme.ink, fontWeight: 600 },
    totalAmount: { fontFamily: theme.fonts.numbers, color: theme.ink },
    totalAmountEmphasis: { fontFamily: theme.fonts.numbers, color: theme.accent, fontWeight: 600 },
    section: { marginTop: 18 },
    paragraph: { color: theme.ink, lineHeight: 1.4 },
    payBox: { marginTop: 18, padding: 10, backgroundColor: theme.surface },
    payRow: { flexDirection: "row", paddingVertical: 1.5 },
    payLabel: { width: 100, flexShrink: 0, color: theme.muted },
    payValue: { flexGrow: 1, flexShrink: 1, flexBasis: 0, fontFamily: theme.fonts.numbers, color: theme.ink },
    signatory: { marginTop: 30, alignSelf: "flex-end", width: 200 },
    signature: { maxHeight: 60, maxWidth: 140, objectFit: "contain", marginTop: 6, alignSelf: "flex-start" },
    // The room a signature would take, so a signed and an unsigned invoice put the line in the same place.
    signatureRoom: { height: 60 },
    signName: { marginTop: 4, fontWeight: 600, color: theme.ink },
    signTitle: { color: theme.muted },
    footer: {
      position: "absolute",
      left: 40,
      right: 40,
      bottom: 24,
      flexDirection: "row",
      justifyContent: "space-between",
      paddingTop: 6,
      borderTopWidth: 0.5,
      borderTopColor: theme.hairline,
      fontSize: 8,
      color: theme.muted,
    },
    signLine: { marginTop: 4, borderTopWidth: 0.5, borderTopColor: theme.ink },
  });
}

type Styles = ReturnType<typeof styles>;

// The firm's own invoice: its name and address and the page count, without the "Made with" line organizations' carry.
function footer(style: Styles, text: string): ReactElement {
  return createElement(
    View,
    { style: style.footer, fixed: true },
    createElement(Text, null, text),
    createElement(Text, {
      render: ({ pageNumber, totalPages }) => `Page ${String(pageNumber)} of ${String(totalPages)}`,
    }),
  );
}

function pdfImage(data: PlatformInvoiceImage, style: Styles["logo"] | Styles["signature"]): ReactElement {
  return createElement(Image, {
    style,
    src: { data: Buffer.from(data.data), format: data.contentType === "image/png" ? "png" : "jpg" },
  });
}

function header(style: Styles, data: PlatformInvoiceData): ReactElement {
  const dates = [`Date: ${data.issuedOn}`, ...(data.dueOn ? [`Due: ${data.dueOn}`] : [])];
  return createElement(
    View,
    { style: style.header, fixed: true },
    createElement(
      View,
      { style: style.firm },
      data.logo ? pdfImage(data.logo, style.logo) : null,
      createElement(Text, { style: style.firmName }, data.seller.name),
    ),
    createElement(
      View,
      { style: style.heading },
      createElement(Text, { style: style.title }, data.title),
      createElement(Text, { style: style.reference }, data.number),
      ...dates.map((date) => createElement(Text, { key: date, style: style.reference }, date)),
    ),
  );
}

function party(
  style: Styles,
  label: string,
  { name, lines, stateLine }: { name: string; lines: readonly string[]; stateLine?: string | undefined },
): ReactElement {
  return createElement(
    View,
    { style: style.party },
    createElement(Text, { style: style.label }, label),
    createElement(Text, { style: style.partyName }, name),
    // The state follows the address, which is the first line; PAN, GSTIN and the rest come after it.
    ...[...lines.slice(0, 1), ...(stateLine === undefined ? [] : [stateLine]), ...lines.slice(1)].map((line, index) =>
      createElement(Text, { key: index, style: style.line }, line),
    ),
  );
}

function table(style: Styles, rows: PlatformInvoiceData["rows"]): ReactElement[] {
  const head = createElement(
    View,
    { key: "head", style: style.tableHead },
    createElement(Text, { style: style.index }, "#"),
    createElement(Text, { style: style.description }, "Description"),
    createElement(Text, { style: style.quantityHead }, "Qty"),
    createElement(Text, { style: style.rateHead }, "Rate"),
    createElement(Text, { style: style.amountHead }, "Amount"),
  );
  // wrap: false keeps a row on one page.
  const body = rows.map((row) =>
    createElement(
      View,
      { key: row.index, style: style.row, wrap: false },
      createElement(Text, { style: style.index }, String(row.index)),
      createElement(Text, { style: style.description }, row.description),
      createElement(Text, { style: style.quantity }, String(row.quantity)),
      createElement(Text, { style: style.rate }, row.rate),
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

function howToPay(style: Styles, rows: readonly { label: string; value: string }[]): ReactElement {
  return createElement(
    View,
    { style: style.payBox, wrap: false },
    createElement(Text, { style: style.label }, "How to pay"),
    ...rows.map((row, index) =>
      createElement(
        View,
        { key: index, style: style.payRow },
        createElement(Text, { style: style.payLabel }, row.label),
        createElement(Text, { style: style.payValue }, row.value),
      ),
    ),
  );
}

function signatureBlock(style: Styles, data: PlatformInvoiceData): ReactElement {
  const { firm, name, title } = data.signatory;
  // With neither given the line still says whose it is.
  const underLine = name === undefined && title === undefined ? "Authorised signatory" : title;
  return createElement(
    View,
    { style: style.signatory, wrap: false },
    createElement(Text, { style: style.paragraph }, `For ${firm}`),
    data.signature ? pdfImage(data.signature, style.signature) : createElement(View, { style: style.signatureRoom }),
    createElement(View, { style: style.signLine }),
    name === undefined ? null : createElement(Text, { style: style.signName }, name),
    underLine === undefined ? null : createElement(Text, { style: style.signTitle }, underLine),
  );
}

export function platformInvoice(data: PlatformInvoiceData, issuedAt: Date): ReactElement<DocumentProps> {
  const theme = pdfTheme({ organizationName: data.seller.name, accentColour: brand.colours.sidebar.fill });
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
      data.payment ? howToPay(style, data.payment.rows) : null,
      data.notes ? section(style, "Notes", [data.notes]) : null,
      signatureBlock(style, data),
      footer(style, data.footer),
    ),
  );
}
