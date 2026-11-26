// What the AI is told when it reads a departure's travellers' notes for room requests: fixed rules, then each booking's
// travellers and the words about their rooms. The notes are fenced as data, never instructions. The model sees names (the notes
// speak of people by name) but no phone, email or amount.
import type { AiMessage } from "@travel-crm/integrations/ai";
import { ROOMING_PROMPT_TEXT } from "./prompt-text.js";

export const ROOMING_PROMPT_NAME = "rooming/read-requests";

export interface RoomingBooking {
  /** "B1": how the prompt names the booking. */
  ref: string;
  customerName: string;
  travellers: readonly { ref: string; name: string; note: string }[];
  /** What staff wrote on the lead, then what the AI kept from the chat: each a short text. */
  staffNotes: readonly string[];
  aiNotes: readonly string[];
}

const fenced = (text: string) => text.replaceAll("<", "‹").replaceAll(">", "›");

export function roomRequestsPrompt(
  bookings: readonly RoomingBooking[],
  instructions: string = ROOMING_PROMPT_TEXT,
): AiMessage[] {
  const blocks = bookings.map((booking) =>
    [
      `Booking ${booking.ref} (customer: ${booking.customerName})`,
      ...booking.travellers.map(
        (traveller) =>
          `  ${traveller.ref}: ${traveller.name} - note about their room: ${traveller.note === "" ? "(none)" : `"${traveller.note}"`}`,
      ),
      ...booking.staffNotes.map((note) => `  Staff note on the booking: "${note}"`),
      ...booking.aiNotes.map((note) => `  Note kept from the customer's chat: "${note}"`),
    ].join("\n"),
  );
  return [
    { role: "system", content: instructions },
    {
      role: "user",
      content: `The travellers:\n<data>${fenced(blocks.join("\n\n"))}</data>\n\nWhich of them asked for something about their room?`,
    },
  ];
}
