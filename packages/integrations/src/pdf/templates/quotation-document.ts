// The quotation's template: the quote page's layout on paper (spec 2026-11-27 item 8). The agency, who it is for, the trip
// and when, the price lines and the total, what is due, the days as light-blue boxes, inclusions with ticks, exclusions
// with crosses, notes as points, and the agency's terms. No tax table: the invoice carries that.
// Written with createElement rather than JSX: dependency-cruiser's resolver doesn't follow imports of .tsx files.
import { Document, Page, Path, StyleSheet, Svg, Text, View, type DocumentProps } from "@react-pdf/renderer";
import { brand } from "@travel-crm/brand";
import { createElement, type ReactElement } from "react";
import type { PdfInput, QuotationDocumentData } from "../document-input.js";
import { pageFooter, pageHeader } from "../page-parts.js";
import { pdfTheme, type PdfTheme } from "../theme.js";

function styles(theme: PdfTheme) {
  const { sky } = brand.colours.avatar;
  return StyleSheet.create({
    page: { paddingTop: 36, paddingHorizontal: 40, paddingBottom: 64, fontFamily: theme.fonts.ui, fontSize: 10 },
    label: { fontFamily: theme.fonts.title, fontSize: 12, fontWeight: 600, color: theme.ink, marginBottom: 6 },
    to: { color: theme.muted, marginBottom: 4 },
    trip: { fontFamily: theme.fonts.title, fontSize: 22, fontWeight: 600, color: theme.ink, lineHeight: 1.2 },
    when: { fontSize: 12, color: theme.ink, marginTop: 4 },
    section: { marginTop: 20 },
    row: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 5,
      borderBottomWidth: 0.5,
      borderBottomColor: theme.hairline,
    },
    // flexBasis 0: the words take only the room the amount leaves, however long.
    words: { flexGrow: 1, flexShrink: 1, flexBasis: 0, paddingRight: 12 },
    small: { fontSize: 8, color: theme.muted, marginTop: 2 },
    amount: { flexShrink: 0, fontFamily: theme.fonts.numbers, color: theme.ink, textAlign: "right" },
    total: { marginTop: 10, fontFamily: theme.fonts.ui, fontSize: 16, fontWeight: 600, color: theme.money },
    totalNote: { fontFamily: theme.fonts.ui, fontSize: 10, fontWeight: 400, color: theme.muted },
    day: { backgroundColor: sky.fill, borderRadius: 6, padding: 9 },
    dayTitle: { fontWeight: 600, color: sky.ink },
    dayText: { color: sky.ink, marginTop: 3, lineHeight: 1.35 },
    arrow: { height: 12, alignSelf: "center" },
    point: { flexDirection: "row", marginBottom: 4 },
    mark: { marginRight: 7, marginTop: 1 },
    bullet: { width: 10, color: theme.muted },
    paragraph: { color: theme.ink, lineHeight: 1.4 },
  });
}

type Styles = ReturnType<typeof styles>;

const section = (style: Styles, label: string, ...body: (ReactElement | null)[]): ReactElement =>
  createElement(View, { style: style.section }, createElement(Text, { style: style.label }, label), ...body);

function priceRow(style: Styles, key: number, words: string, detail: string | undefined, amount: string) {
  return createElement(
    View,
    { key, style: style.row, wrap: false },
    createElement(
      View,
      { style: style.words },
      createElement(Text, null, words),
      detail ? createElement(Text, { style: style.small }, detail) : null,
    ),
    createElement(Text, { style: style.amount }, amount),
  );
}

function price(style: Styles, data: QuotationDocumentData): ReactElement {
  return section(
    style,
    "Price",
    ...data.lines.map((line, index) => priceRow(style, index, line.description, line.detail, line.amount)),
    // One run of text, "Total ₹8,999 (incl. 5% GST)", the way the quote page says it.
    createElement(
      Text,
      { style: style.total, wrap: false },
      `Total ${data.total}`,
      data.totalNote ? createElement(Text, { style: style.totalNote }, ` (${data.totalNote})`) : null,
    ),
  );
}

function dues(style: Styles, data: QuotationDocumentData): ReactElement | null {
  if (data.dues.length === 0) return null;
  return section(
    style,
    "To pay",
    ...data.dues.map((due, index) => priceRow(style, index, due.label, `By ${due.by}`, due.amount)),
  );
}

function days(style: Styles, data: QuotationDocumentData): ReactElement | null {
  if (data.days.length === 0) return null;
  return section(
    style,
    "Your trip, day by day",
    ...data.days.map((day, index) =>
      createElement(
        View,
        { key: index, wrap: false },
        index === 0
          ? null
          : createElement(
              Svg,
              { style: style.arrow, width: 12, height: 12, viewBox: "0 0 12 12" },
              createElement(Path, {
                d: "M6 2 L6 10 M3 7 L6 10 L9 7",
                stroke: brand.colours.avatar.sky.ink,
                strokeWidth: 1.2,
                fill: "none",
              }),
            ),
        createElement(
          View,
          { style: style.day },
          createElement(Text, { style: style.dayTitle }, `Day ${String(index + 1)}: ${day.title}`),
          day.description ? createElement(Text, { style: style.dayText }, day.description) : null,
        ),
      ),
    ),
  );
}

/** A green tick or a red cross, drawn: the fonts carry neither. */
function mark(style: Styles, kind: "tick" | "cross"): ReactElement {
  const { good, bad } = brand.colours.status;
  const colour = kind === "tick" ? good : bad;
  return createElement(
    Svg,
    { style: style.mark, width: 12, height: 12, viewBox: "0 0 12 12" },
    createElement(Path, {
      d: kind === "tick" ? "M2 6.5 L5 9 L10 3" : "M3 3 L9 9 M9 3 L3 9",
      stroke: colour.ink,
      strokeWidth: 1.6,
      fill: "none",
    }),
  );
}

function points(style: Styles, label: string, texts: string[], kind: "tick" | "cross" | "dot"): ReactElement | null {
  if (texts.length === 0) return null;
  return section(
    style,
    label,
    ...texts.map((text, index) =>
      createElement(
        View,
        { key: index, style: style.point, wrap: false },
        kind === "dot" ? createElement(Text, { style: style.bullet }, "•") : mark(style, kind),
        createElement(Text, { style: style.words }, text),
      ),
    ),
  );
}

export function quotationDocument({ data, branding, issuedAt }: PdfInput): ReactElement<DocumentProps> {
  if (!("lines" in data)) throw new TypeError("The quotation template needs a quotation's content");
  const theme = pdfTheme(branding);
  const style = styles(theme);
  return createElement(
    Document,
    {
      title: `Quotation ${data.number}`,
      author: branding.organizationName,
      creator: brand.productName,
      producer: brand.productName,
      creationDate: issuedAt,
      modificationDate: issuedAt,
    },
    createElement(
      Page,
      { size: "A4", style: style.page },
      pageHeader({ branding, theme, title: "Quotation", number: data.number, issuedOn: data.issuedOn }),
      createElement(Text, { style: style.to }, `To: ${data.customer}`),
      createElement(Text, { style: style.trip }, data.title),
      data.when ? createElement(Text, { style: style.when }, data.when) : null,
      price(style, data),
      dues(style, data),
      days(style, data),
      points(style, "Included", data.inclusions, "tick"),
      points(style, "Not included", data.exclusions, "cross"),
      points(style, "Notes", data.notes, "dot"),
      branding.terms ? section(style, "Terms", createElement(Text, { style: style.paragraph }, branding.terms)) : null,
      pageFooter({ branding, theme }),
    ),
  );
}
