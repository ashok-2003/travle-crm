"use client";

// The "Fill with AI" button on a booking's Travellers card, and its sheet. Hidden where the AI isn't on for the member, the plan
// or the agency; held, with the subscription's hint, where the save would be refused. Its place is kept while that is read.
import type { BookingDetail } from "@travel-crm/contracts/bookings";
import { SparklesIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useWriteAccess } from "@/subscription/write-access";
import { useFillAvailable } from "../fill/use-ai-fill";
import { TravellersFillSheet } from "./travellers-fill-sheet";

export function FillTravellersWithAi({ booking }: { booking: BookingDetail }) {
  const t = useTranslations("ai.travellers");
  const available = useFillAvailable("travellers");
  const write = useWriteAccess("change");
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  if (available === "loading") return <div aria-hidden="true" className="h-11" />;
  if (available === "off") return null;
  return (
    <div>
      <Button
        ref={opener}
        type="button"
        variant="ai"
        disabled={!write.allowed || booking.travellers.length === 0}
        onClick={() => {
          setOpen(true);
        }}
      >
        <SparklesIcon aria-hidden="true" />
        {t("button")}
      </Button>
      <TravellersFillSheet booking={booking} open={open} onOpenChange={setOpen} returnFocusTo={opener} />
    </div>
  );
}
