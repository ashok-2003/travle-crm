// The parts every page of a document shares: the organization's header, and the footer with the page count.
// Written with createElement rather than JSX: dependency-cruiser's resolver doesn't follow imports of .tsx files.
import { Image, StyleSheet, Text, View } from "@react-pdf/renderer";
import { brand } from "@travel-crm/brand";
import { createElement, type ReactElement } from "react";
import type { DocumentBranding } from "./document-input.js";
import type { PdfTheme } from "./theme.js";

function styles(theme: PdfTheme) {
  return StyleSheet.create({
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-end",
      paddingBottom: 10,
      marginBottom: 18,
      borderBottomWidth: 2,
      borderBottomColor: theme.accent,
    },
    organization: { flexDirection: "row", alignItems: "center", gap: 10 },
    logo: { maxHeight: 40, maxWidth: 120, objectFit: "contain" },
    organizationName: { fontFamily: theme.fonts.title, fontSize: 18, fontWeight: 600, color: theme.ink },
    heading: { alignItems: "flex-end" },
    title: { fontFamily: theme.fonts.title, fontSize: 20, fontWeight: 600, color: theme.accent },
    reference: { fontFamily: theme.fonts.numbers, fontSize: 9, color: theme.muted, marginTop: 2 },
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
      fontFamily: theme.fonts.ui,
      fontSize: 8,
      color: theme.muted,
    },
  });
}

/** The organization's logo and name on the left, the document's title, number and date on the right. */
export function pageHeader(props: {
  branding: DocumentBranding;
  theme: PdfTheme;
  title: string;
  number: string;
  issuedOn: string;
}): ReactElement {
  const style = styles(props.theme);
  const { logo } = props.branding;
  const logoImage =
    logo &&
    createElement(Image, {
      style: style.logo,
      src: { data: Buffer.from(logo.data), format: logo.contentType === "image/png" ? "png" : "jpg" },
    });
  return createElement(
    View,
    { style: style.header, fixed: true },
    createElement(
      View,
      { style: style.organization },
      logoImage,
      createElement(Text, { style: style.organizationName }, props.branding.organizationName),
    ),
    createElement(
      View,
      { style: style.heading },
      createElement(Text, { style: style.title }, props.title),
      createElement(Text, { style: style.reference }, props.number),
      createElement(Text, { style: style.reference }, props.issuedOn),
    ),
  );
}

/** The organization's name and the product's on the left, "Page x of y" on the right, on every page. */
export function pageFooter(props: { branding: DocumentBranding; theme: PdfTheme }): ReactElement {
  const style = styles(props.theme);
  return createElement(
    View,
    { style: style.footer, fixed: true },
    createElement(Text, null, `${props.branding.organizationName} · Made with ${brand.productName}`),
    createElement(Text, {
      render: ({ pageNumber, totalPages }) => `Page ${String(pageNumber)} of ${String(totalPages)}`,
    }),
  );
}
