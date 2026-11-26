// A QR code drawn as an SVG: dark modules (the text colour) on the page colour with the spec's 4-module quiet zone, so a
// phone reads it wherever it sits.
import { encode } from "uqr";

export function QrCode({ value, label, className }: { value: string; label: string; className?: string }) {
  const { data, size } = encode(value, { ecc: "M", border: 4 });
  // One path of 1x1 squares: small to send, crisp at any size.
  const squares = data.flatMap((row, y) =>
    row.flatMap((dark, x) => (dark ? [`M${String(x)} ${String(y)}h1v1h-1z`] : [])),
  );
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${String(size)} ${String(size)}`}
      shapeRendering="crispEdges"
      className={className}
    >
      <rect width={size} height={size} style={{ fill: "var(--card)" }} />
      <path d={squares.join("")} fill="currentColor" />
    </svg>
  );
}
