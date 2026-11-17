"use client";

// A group package's seasons (group packages): the dates each set of per-person room prices holds, listed with the price of
// every room type the package sells. A booking is priced from the season of its first day. Adding or changing one is a dialog.
import type { PackageDetail, PackageSeasonView } from "@travel-crm/contracts/quotes";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { SectionCard } from "@/bookings/section-card";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { rupees } from "@/components/forms/money-field";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { formatCalendarDay } from "@/lib/format";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { shownRoomTypes } from "@/room-prices/room-prices";
import { SeasonDialog } from "./season-dialog";
import { usePackageChanges } from "./use-packages";

export function SeasonsCard({ detail }: { detail: PackageDetail }) {
  const t = useTranslations("packages.seasons");
  const tRooms = useTranslations("packages.form.roomTypeNames");
  const access = useWriteAccess("change");
  const hintId = `${useId()}-write`;
  const { removeSeason } = usePackageChanges();
  // One dialog for the card: `editing` is the season it shows (null for a new one) while `open`.
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PackageSeasonView | null>(null);
  const [removing, setRemoving] = useState<PackageSeasonView | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const openFrom = (button: HTMLElement, season: PackageSeasonView | null) => {
    opener.current = button;
    setEditing(season);
    setOpen(true);
  };
  const noRooms = detail.roomTypes.length === 0;
  return (
    <SectionCard title={t("title")} anchor="package-seasons">
      <p className="text-muted-foreground">{t("intro")}</p>
      {detail.seasons.length === 0 ? (
        <p className="text-muted-foreground">{t("none")}</p>
      ) : (
        <Table>
          <TableBody>
            {detail.seasons.map((season) => (
              <TableRow key={season.id}>
                <TableCell>
                  <p className="font-medium">{season.label}</p>
                  <p className="text-caption text-muted-foreground">
                    {t("dates", { from: formatCalendarDay(season.startsOn), to: formatCalendarDay(season.endsOn) })}
                  </p>
                  <ul className="numbers">
                    {shownRoomTypes(detail.roomTypes, season.prices).map((room) => {
                      const price = season.prices[room];
                      return (
                        <li key={room}>
                          {t("priceLine", {
                            room: tRooms(room),
                            price: price === null ? t("notOffered") : rupees(price),
                          })}
                        </li>
                      );
                    })}
                  </ul>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="outline"
                    aria-label={t("editNamed", { name: season.label })}
                    disabled={!access.allowed}
                    aria-describedby={access.allowed ? undefined : hintId}
                    onClick={(event) => {
                      openFrom(event.currentTarget, season);
                    }}
                  >
                    {t("edit")}
                  </Button>
                  <Button
                    variant="ghost"
                    aria-label={t("removeNamed", { name: season.label })}
                    disabled={!access.allowed}
                    aria-describedby={access.allowed ? undefined : hintId}
                    onClick={(event) => {
                      opener.current = event.currentTarget;
                      setRemoving(season);
                    }}
                  >
                    {t("remove")}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {noRooms && <p className="text-muted-foreground">{t("noRoomTypes")}</p>}
      <div>
        <Button
          variant="outline"
          disabled={!access.allowed || noRooms}
          aria-describedby={access.allowed ? undefined : hintId}
          onClick={(event) => {
            openFrom(event.currentTarget, null);
          }}
        >
          {t("add")}
        </Button>
        <WriteHint id={hintId} hint={access.hint} />
      </div>
      <SeasonDialog
        packageId={detail.id}
        season={editing}
        offered={detail.roomTypes}
        pricesIncludeGst={detail.pricesIncludeGst}
        held={{ open, setOpen }}
        returnFocusTo={opener}
      />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(next) => {
          if (!next) setRemoving(null);
        }}
        title={t("removeTitle", { name: removing?.label ?? "" })}
        description={t("removeDescription")}
        action={t("remove")}
        request={removeSeason}
        returnFocusTo={opener}
        onConfirm={() => {
          if (removing === null) return;
          removeSeason.mutate(
            { seasonId: removing.id },
            {
              onSuccess: () => {
                toast.success(t("removed"));
                setRemoving(null);
              },
            },
          );
        }}
      />
    </SectionCard>
  );
}
