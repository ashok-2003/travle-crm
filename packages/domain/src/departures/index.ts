// Public API of @travel-crm/domain/departures: group departures with seats, holds and a waitlist, the rooming list for their
// hotels, and what Today shows about them (release 7a). It sits above crm, tasks and notifications, and bookings call it:
// an accepted quote on a departure turns its hold into the booking there. Seats are worked out, never stored.
export {
  cancelDeparture,
  createDeparture,
  getDeparture,
  listDepartures,
  setDepartureStatus,
  updateDeparture,
} from "./departures.js";
export { DEPARTURE_HOLDS_QUEUE, runDepartureHoldExpiry, type DepartureJobDependencies } from "./due-work.js";
export { eraseDepartureParts, type DeparturesErased } from "./erasure.js";
export {
  bookingJoinedDeparture,
  createHold,
  expireHolds,
  HOLD_EXPIRED_KIND,
  OVERBOOKED_KIND,
  releaseHold,
} from "./holds.js";
export { listLeadDepartures } from "./lead-departures.js";
export { departureMoneyOf } from "./money.js";
export { makeQuoteFromHold, setQuoteDeparture } from "./quote-link.js";
export { draftRooms, needRoommateDecision } from "./rooming-draft.js";
export { issueRoomingList, roomingCsvOf } from "./rooming-export.js";
export { getRooming } from "./rooming-rows.js";
export {
  addRoom,
  copyStayLayout,
  draftStayRooms,
  moveTraveller,
  removeRoom,
  removeRoomingStay,
  saveRoomingStay,
  updateRoom,
} from "./rooming.js";
export { countsOf, departureSettingsOf, seatsSoldAndHeld } from "./rows.js";
export { departureSettingsView, saveDepartureSettings } from "./settings.js";
export { departuresStartingSoon, type DepartureSoon } from "./today-source.js";
export {
  addToWaitlist,
  announceSeatsFreed,
  removeFromWaitlist,
  SEATS_FREE_KIND,
  seatsFreedListener,
} from "./waitlist.js";
