// The product's mark and name together: the logo (the brand's icon), the name's first words bold and its last word in
// the action colour, on light surfaces or the deep green ones (`onDark`). The name comes from the brand alone.
import { brand } from "@travel-crm/brand";
import Image from "next/image";
import { cn } from "@/lib/utils";

export function BrandMark({ onDark = false, size = "md" }: { onDark?: boolean; size?: "md" | "lg" }) {
  const words = brand.productName.split(" ");
  const last = words.length > 1 ? words.at(-1) : undefined;
  const first = last === undefined ? brand.productName : words.slice(0, -1).join(" ");
  const pixels = size === "lg" ? 44 : 32;
  return (
    <span className="flex items-center gap-2.5">
      <span className={cn("flex shrink-0 rounded-xl", onDark && "bg-primary-foreground/10 p-1")}>
        {/* The brand's mark, which the build copies to /icons; the name beside it says what it is. */}
        <Image src="/icons/favicon.svg" alt="" width={pixels} height={pixels} priority />
      </span>
      <span
        className={cn(
          "font-semibold tracking-tight",
          size === "lg" ? "text-title-mobile" : "text-section",
          onDark ? "text-sidebar-foreground" : "text-foreground",
        )}
      >
        {first}
        {last !== undefined && <span className={onDark ? "text-sidebar-foreground/90" : "text-primary"}> {last}</span>}
      </span>
    </span>
  );
}
