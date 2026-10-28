"use client";

// A row of headline figures for the console's growth screens (the invite program, usage): each an icon, its number in
// mono and its label, on the registry Item, two across on a phone and up to four or six on a wide screen.
import type { LucideIcon } from "lucide-react";
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item";
import { cn } from "@/lib/utils";

export interface Figure {
  key: string;
  icon: LucideIcon;
  value: string;
  label: string;
}

export function Figures({ figures, label, wide = false }: { figures: Figure[]; label: string; wide?: boolean }) {
  return (
    <ul
      className={cn("grid grid-cols-2 gap-2", wide ? "md:grid-cols-3 xl:grid-cols-6" : "md:grid-cols-4")}
      aria-label={label}
    >
      {figures.map((figure) => (
        <li key={figure.key}>
          <Item variant="muted" className="h-full">
            <ItemMedia variant="icon">
              <figure.icon aria-hidden="true" className="text-primary" />
            </ItemMedia>
            <ItemContent>
              <ItemTitle className="font-mono text-number-lg tabular-nums">{figure.value}</ItemTitle>
              <ItemDescription>{figure.label}</ItemDescription>
            </ItemContent>
          </Item>
        </li>
      ))}
    </ul>
  );
}

/** "2h 15m", "8m", "0m": time in the product, to the minute. */
export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${String(minutes)}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${String(hours)}h` : `${String(hours)}h ${String(rest)}m`;
}
