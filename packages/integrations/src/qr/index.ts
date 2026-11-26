// A link drawn as a QR code: dark squares as one path, for the customer's page (an inline SVG) and the PDF (vector).
import { encode } from "uqr";

/** The code's modules as one path of 1x1 squares, in a `size` x `size` box that already holds a quiet border. */
export function qrSquares(value: string): { size: number; path: string } {
  const { data, size } = encode(value, { ecc: "M", border: 2 });
  const path = data
    .flatMap((row, y) => row.flatMap((dark, x) => (dark ? [`M${String(x)} ${String(y)}h1v1h-1z`] : [])))
    .join("");
  return { size, path };
}

const attribute = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

/** The code as an inline SVG: black on white (a scanner needs the contrast, in a dark theme too), named for a screen reader. */
export function qrSvg(value: string, label: string): string {
  const { size, path } = qrSquares(value);
  const box = String(size);
  return `<svg role="img" aria-label="${attribute(label)}" viewBox="0 0 ${box} ${box}" shape-rendering="crispEdges"><rect width="${box}" height="${box}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}
