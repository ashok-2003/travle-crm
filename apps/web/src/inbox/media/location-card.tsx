"use client";

// A place a customer shared (audit 14): a card with a pin, the coordinates and Open in Maps, which opens Google Maps in a tab of
// its own. No map is drawn here: nothing about where a customer is goes to a map service until a member chooses to open it.
import { MapPinIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item";

export function LocationCard({ latitude, longitude }: { latitude: number; longitude: number }) {
  const t = useTranslations("inbox.chat.place");
  const point = `${String(latitude)}, ${String(longitude)}`;
  return (
    <Item variant="muted" size="sm" className="min-w-60 flex-wrap">
      <ItemMedia variant="icon">
        <MapPinIcon aria-hidden="true" />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle>{t("title")}</ItemTitle>
        <ItemDescription className="whitespace-nowrap">{point}</ItemDescription>
      </ItemContent>
      <ItemActions>
        <Button asChild variant="outline" size="sm">
          <a
            target="_blank"
            rel="noopener noreferrer"
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(point)}`}
          >
            {t("open")}
          </a>
        </Button>
      </ItemActions>
    </Item>
  );
}
