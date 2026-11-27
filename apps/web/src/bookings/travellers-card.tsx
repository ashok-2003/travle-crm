"use client";

// A booking's travellers (release 6): "3 of 4 complete", what each fills in (Basic, Detailed, International), how many there
// are, and each traveller with a way to fill or fix their row. Travellers fill their own rows from the trip page until the
// cut-off; staff may at any time. An ID number is never shown here: a traveller with one on file says so.
import type { BookingDetail } from "@travel-crm/contracts/bookings";
import { EllipsisIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { StatusBadge } from "@/components/status-badge";
import { FillTravellersWithAi } from "@/ai/travellers/fill-travellers-with-ai";
import { Button } from "@/components/ui/button";
import { SectionCard } from "./section-card";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { prefilledField } from "@/components/card-tints";
import { formatCalendarDay } from "@/lib/format";
import { mayBeMissing } from "@/lib/older-api";
import { cn } from "@/lib/utils";
import { useHolds } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { TravellerDialog } from "./traveller-dialog";
import { TravellerSettingsDialog } from "./traveller-settings-dialog";

export function TravellersCard({ booking }: { booking: BookingDetail }) {
  const t = useTranslations("bookings.travellers");
  const mayEdit = useHolds("bookings:edit") && booking.status !== "cancelled";
  const access = useWriteAccess("change");
  const count = booking.travellers.length;
  const [settings, setSettings] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  return (
    <SectionCard title={t("heading")} anchor="travellers">
      <p>
        <span className="numbers font-semibold">
          {t("progress", { done: booking.travellersComplete, total: booking.travellersTotal })}
        </span>
        {booking.detailsCutoffOn !== null && (
          <span className="text-muted-foreground">
            {" "}
            · {t("cutoff", { day: formatCalendarDay(booking.detailsCutoffOn) })}
          </span>
        )}
      </p>
      {mayEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <FillTravellersWithAi booking={booking} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button ref={menuButton} variant="ghost" size="icon" aria-label={t("menu")}>
                <EllipsisIcon aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                disabled={!access.allowed}
                onSelect={() => {
                  setSettings(true);
                }}
              >
                {t("settings")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <TravellerSettingsDialog
            booking={booking}
            held={{ open: settings, setOpen: setSettings }}
            returnFocusTo={menuButton}
          />
        </div>
      )}
      {count === 0 ? (
        <p className="text-muted-foreground">{t("none")}</p>
      ) : (
        <ItemGroup>
          {booking.travellers.map((traveller, index) => {
            // An older api sends no marks.
            const prefilled = mayBeMissing(traveller.prefilled) ?? [];
            return (
              <Item key={traveller.id} size="sm" role="listitem">
                <ItemContent>
                  <ItemTitle>
                    {traveller.name === "" ? (
                      t("unnamed", { number: index + 1 })
                    ) : (
                      <span className={cn(prefilled.includes("name") && `rounded-sm px-1 ${prefilledField}`)}>
                        {traveller.name}
                      </span>
                    )}
                  </ItemTitle>
                  <ItemDescription>
                    {prefilled.length > 0 ? `${t("prefilled")} · ` : ""}
                    {traveller.complete ? t("complete") : t("missing")}
                    {traveller.hasIdentity ? ` · ${t("idOnFile")}` : ""}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <StatusBadge tone={traveller.complete ? "good" : "attention"}>
                    {traveller.complete ? t("badge.complete") : t("badge.missing")}
                  </StatusBadge>
                  {mayEdit && (
                    <TravellerDialog
                      traveller={traveller}
                      level={booking.level}
                      number={index + 1}
                      onDeparture={booking.departure !== null}
                    />
                  )}
                </ItemActions>
              </Item>
            );
          })}
        </ItemGroup>
      )}
    </SectionCard>
  );
}
