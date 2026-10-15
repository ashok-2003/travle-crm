// A QR code drawn as an SVG, in the text colour, so it needs no image and no colour of its own.
import { encode } from "uqr";

export function QrCode({ value, label, className }: { value: string; label: string; className?: string }) {
  const { data, size } = encode(value, { ecc: "M", border: 2 });
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
      <path d={squares.join("")} fill="currentColor" />
    </svg>
  );
}
