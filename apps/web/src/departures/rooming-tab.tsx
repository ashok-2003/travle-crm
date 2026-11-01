"use client";

// A departure's Rooming tab (release 7a, spec 5.9 in plain code): each hotel stay with its rooms and who sleeps in which,
// and the travellers with no room under Unassigned. "Draft rooms" fills them the same way every time (a party together,
// requests honoured, solo travellers paired by gender); a "Move to room" select places one by hand and keeps them there.
// The hotel gets a numbered PDF or a CSV: names and requests only.
import type { DepartureDetail, RoomingRoom, RoomingStay, RoomingTraveller } from "@travel-crm/contracts/departures";
import { FileDownIcon, FileSpreadsheetIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { RefusalAlert } from "@/components/refusal-alert";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCalendarDay } from "@/lib/format";
import { useHolds } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { SectionCard } from "@/bookings/section-card";
import { BedDoubleIcon } from "lucide-react";
import { RoomDialog } from "./room-dialog";
import { StayDialog } from "./stay-dialog";
import { useRooming, useRoomingChanges } from "./use-departures";
import { useRoomingCsv, useRoomingPdf } from "./use-rooming-files";

const NO_ROOM = "none";

function TravellerRow({
  traveller,
  stay,
  current,
  mayEdit,
}: {
  traveller: RoomingTraveller;
  stay: RoomingStay;
  current: string;
  mayEdit: boolean;
}) {
  const t = useTranslations("departures.rooming");
  const changes = useRoomingChanges();
  const access = useWriteAccess("change");
  const request = t(`requests.${traveller.roomRequest}`);
  const notes = [request, traveller.roomNote, traveller.locked ? t("locked") : ""].filter((part) => part !== "");
  return (
    <Item size="sm" role="listitem" className="items-start">
      <ItemContent className="min-w-0">
        <ItemTitle>{traveller.name}</ItemTitle>
        <ItemDescription className="flex flex-wrap items-center gap-2">
          <span className="numbers">{traveller.bookingNumber}</span>
          {notes.length > 0 && <span>{notes.join(" · ")}</span>}
          {traveller.needsRoommateDecision && <StatusBadge tone="attention">{t("needsDecision")}</StatusBadge>}
        </ItemDescription>
      </ItemContent>
      {mayEdit && (
        <ItemActions className="basis-full md:basis-56">
          <Select
            value={current}
            disabled={changes.move.isPending || !access.allowed}
            onValueChange={(roomId) => {
              changes.move.mutate(
                { stayId: stay.id, travellerId: traveller.travellerId, roomId: roomId === NO_ROOM ? null : roomId },
                { onSuccess: () => toast.success(t("moved")) },
              );
            }}
          >
            <SelectTrigger className="w-full" aria-label={t("moveToNamed", { name: traveller.name })}>
              <SelectValue placeholder={t("moveTo")} />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value={NO_ROOM}>{t("noRoom")}</SelectItem>
              {stay.rooms.map((room) => (
                <SelectItem key={room.id} value={room.id}>
                  {t("room", { label: room.label })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </ItemActions>
      )}
      <RefusalAlert error={changes.move.error} />
    </Item>
  );
}

function RoomBlock({ room, stay, mayEdit }: { room: RoomingRoom; stay: RoomingStay; mayEdit: boolean }) {
  const t = useTranslations("departures.rooming");
  const changes = useRoomingChanges();
  const [removing, setRemoving] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">
          {t("room", { label: room.label })}{" "}
          <span className="text-caption font-normal text-muted-foreground">
            {t("roomCapacity", { count: room.capacity })}
          </span>{" "}
          {room.groundFloor && <StatusBadge tone="neutral">{t("groundFloor")}</StatusBadge>}
        </p>
        {mayEdit && (
          <div className="flex flex-wrap gap-2">
            <RoomDialog stayId={stay.id} room={room} />
            <Button
              variant="ghost"
              aria-label={t("removeNamed", { label: room.label })}
              onClick={() => {
                setRemoving(true);
              }}
            >
              {t("remove")}
            </Button>
          </div>
        )}
      </div>
      {room.travellers.length === 0 ? (
        <p className="text-muted-foreground">{t("empty")}</p>
      ) : (
        <ItemGroup>
          {room.travellers.map((traveller) => (
            <TravellerRow
              key={traveller.travellerId}
              traveller={traveller}
              stay={stay}
              current={room.id}
              mayEdit={mayEdit}
            />
          ))}
        </ItemGroup>
      )}
      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title={t("removeRoomTitle")}
        description={t("removeRoomDescription")}
        action={t("remove")}
        request={changes.removeRoom}
        onConfirm={() => {
          changes.removeRoom.mutate(
            { roomId: room.id },
            {
              onSuccess: () => {
                setRemoving(false);
              },
            },
          );
        }}
      />
    </div>
  );
}

function StayBlock({ stay, mayEdit, departureId }: { stay: RoomingStay; mayEdit: boolean; departureId: string }) {
  const t = useTranslations("departures.rooming");
  const changes = useRoomingChanges();
  const pdf = useRoomingPdf();
  const csv = useRoomingCsv();
  const access = useWriteAccess("change");
  const [removing, setRemoving] = useState(false);
  const draftedNow = (left: number) => toast.success(left === 0 ? t("drafted") : t("draftedLeft", { count: left }));
  return (
    <SectionCard title={stay.hotelName}>
      <p className="text-muted-foreground">
        {t("stayDates", { from: formatCalendarDay(stay.checkIn), to: formatCalendarDay(stay.checkOut) })}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {mayEdit && (
          <>
            <Button
              variant="default"
              disabled={changes.draft.isPending || !access.allowed}
              onClick={() => {
                changes.draft.mutate({ stayId: stay.id }, { onSuccess: ({ unassigned }) => draftedNow(unassigned) });
              }}
            >
              {t("draft")}
            </Button>
            <RoomDialog stayId={stay.id} room={null} />
            <Button
              variant="outline"
              disabled={changes.copyLayout.isPending || !access.allowed}
              onClick={() => {
                changes.copyLayout.mutate(
                  { stayId: stay.id },
                  { onSuccess: ({ copied }) => toast.success(t("copied", { count: copied })) },
                );
              }}
            >
              {t("copyLayout")}
            </Button>
          </>
        )}
        <Button
          variant="outline"
          aria-label={t("pdfNamed", { name: stay.hotelName })}
          disabled={pdf.isPending || !access.allowed || stay.rooms.every((room) => room.travellers.length === 0)}
          onClick={() => {
            pdf.mutate(stay.id);
          }}
        >
          <FileDownIcon aria-hidden="true" />
          {t("pdf")}
        </Button>
        <Button
          variant="outline"
          aria-label={t("csvNamed", { name: stay.hotelName })}
          disabled={csv.isPending}
          onClick={() => {
            csv.mutate(stay.id, { onSuccess: () => toast.success(t("csvMade")) });
          }}
        >
          <FileSpreadsheetIcon aria-hidden="true" />
          {t("csv")}
        </Button>
      </div>
      <p className="text-caption text-muted-foreground">{t(`pdfStates.${stay.documentState}`)}</p>
      <RefusalAlert error={changes.draft.error ?? changes.copyLayout.error ?? pdf.error ?? csv.error} />
      {stay.rooms.map((room) => (
        <RoomBlock key={room.id} room={room} stay={stay} mayEdit={mayEdit} />
      ))}
      <div className="flex flex-col gap-2">
        <p className="font-semibold">{t("unassigned")}</p>
        {stay.unassigned.length === 0 ? (
          <p className="text-muted-foreground">{t("unassignedNone")}</p>
        ) : (
          <ItemGroup>
            {stay.unassigned.map((traveller) => (
              <TravellerRow
                key={traveller.travellerId}
                traveller={traveller}
                stay={stay}
                current={NO_ROOM}
                mayEdit={mayEdit}
              />
            ))}
          </ItemGroup>
        )}
      </div>
      {mayEdit && (
        <div className="flex flex-wrap gap-2">
          <StayDialog departureId={departureId} stay={stay} />
          <Button
            variant="ghost"
            aria-label={t("removeStayNamed", { name: stay.hotelName })}
            onClick={() => {
              setRemoving(true);
            }}
          >
            {t("removeStay")}
          </Button>
        </div>
      )}
      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title={t("removeStayTitle")}
        description={t("removeStayDescription")}
        action={t("removeStay")}
        request={changes.removeStay}
        onConfirm={() => {
          changes.removeStay.mutate(
            { stayId: stay.id },
            {
              onSuccess: () => {
                setRemoving(false);
              },
            },
          );
        }}
      />
    </SectionCard>
  );
}

export function RoomingTab({ departure }: { departure: DepartureDetail }) {
  const t = useTranslations("departures.rooming");
  const tCommon = useTranslations("common");
  const mayEdit = useHolds("departures:edit");
  const rooming = useRooming(departure.id);
  if (rooming.data === undefined) {
    return rooming.isError ? (
      <ErrorState
        message={t("loadFailed")}
        error={rooming.error}
        retryLabel={tCommon("tryAgain")}
        onRetry={() => void rooming.refetch()}
      />
    ) : (
      <LoadingRows shape="twoLines" label={t("loading")} />
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <p className="text-muted-foreground">
        {t("intro")} {t("travellers", { count: rooming.data.travellers })}
      </p>
      {rooming.data.stays.length === 0 ? (
        <EmptyState icon={BedDoubleIcon} message={t("none")} />
      ) : (
        rooming.data.stays.map((stay) => (
          <StayBlock key={stay.id} stay={stay} mayEdit={mayEdit} departureId={departure.id} />
        ))
      )}
      {mayEdit && (
        <div>
          <StayDialog departureId={departure.id} stay={null} />
        </div>
      )}
    </div>
  );
}
