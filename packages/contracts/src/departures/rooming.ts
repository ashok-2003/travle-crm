// The rooming list (release 7a, spec 5.9 in plain code): a departure's stays (a hotel with dates), each stay's rooms and who
// sleeps in which. Names and requests only: no IDs, phones or money.
import { z } from "zod";
import { recordId } from "../identity/fields.js";
import { calendarDate } from "../kernel/index.js";

export const roomRequests = ["none", "single_room", "ground_floor", "near_group"] as const;
export const roomRequest = z.enum(roomRequests);
export type RoomRequest = z.infer<typeof roomRequest>;

const text = (max: number) => z.string().trim().max(max);

export const saveRoomingStayInput = z.strictObject({
  departureId: recordId,
  /** Set to change a stay; left out to add one. */
  stayId: recordId.optional(),
  hotelName: text(120).min(1),
  supplierId: recordId.nullable(),
  checkIn: calendarDate,
  checkOut: calendarDate,
});
export type SaveRoomingStayInput = z.infer<typeof saveRoomingStayInput>;
export const stayIdInput = z.strictObject({ stayId: recordId });
export const departureStayIdInput = stayIdInput;

export const addRoomInput = z.strictObject({
  stayId: recordId,
  label: text(40).min(1),
  capacity: z.int().min(1).max(4),
  groundFloor: z.boolean(),
});
export type AddRoomInput = z.infer<typeof addRoomInput>;
export const updateRoomInput = z.strictObject({
  roomId: recordId,
  label: text(40).min(1),
  capacity: z.int().min(1).max(4),
  groundFloor: z.boolean(),
});
export const roomIdInput = z.strictObject({ roomId: recordId });
export const moveTravellerInput = z.strictObject({
  stayId: recordId,
  travellerId: recordId,
  /** The room to put them in; null takes them out of every room of the stay. */
  roomId: recordId.nullable(),
});
export type MoveTravellerInput = z.infer<typeof moveTravellerInput>;

export const roomingTraveller = z.object({
  travellerId: recordId,
  /** The name they gave, or "Traveller 2 of BK-2026-0004" until they do. */
  name: z.string(),
  bookingNumber: z.string(),
  roomRequest,
  roomNote: z.string(),
  locked: z.boolean(),
  /** A solo traveller of unknown gender, who stays alone until staff decide. */
  needsRoommateDecision: z.boolean(),
});
export type RoomingTraveller = z.infer<typeof roomingTraveller>;

export const roomingRoom = z.object({
  id: recordId,
  label: z.string(),
  capacity: z.int(),
  groundFloor: z.boolean(),
  travellers: z.array(roomingTraveller),
});
export type RoomingRoom = z.infer<typeof roomingRoom>;

/** The PDF last issued for a stay: none yet, up to date, or made before the rooms changed. */
export const roomingDocumentState = z.enum(["none", "current", "out_of_date"]);

export const roomingStay = z.object({
  id: recordId,
  hotelName: z.string(),
  supplierId: recordId.nullable(),
  checkIn: calendarDate,
  checkOut: calendarDate,
  rooms: z.array(roomingRoom),
  unassigned: z.array(roomingTraveller),
  documentState: roomingDocumentState,
  documentId: recordId.nullable(),
});
export type RoomingStay = z.infer<typeof roomingStay>;

export const rooming = z.object({
  travellers: z.int(),
  stays: z.array(roomingStay),
});
export type Rooming = z.infer<typeof rooming>;

export const roomingCsv = z.object({ filename: z.string(), content: z.string() });
export const roomingDocument = z.object({ documentId: recordId, number: z.string() });
