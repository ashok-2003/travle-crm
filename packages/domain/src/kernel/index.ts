// Public API of the shared kernel: building blocks every domain module uses.
export { platformActor, publicActor, systemActor, type Actor, type ActorSource } from "./actor.js";
export { DomainError, type DomainErrorCode } from "./errors.js";
export { formatIndianNumber, formatMoney } from "./indian-format.js";
export {
  add,
  compare,
  isZero,
  money,
  multiply,
  negate,
  parseRupees,
  subtract,
  sum,
  type CurrencyCode,
  type Money,
} from "./money.js";
export { allocate, fractionOf, percentageOf, type Rounding } from "./money-rounding.js";
export { ipv6Groups } from "./ip-address.js";
export {
  indiaGst,
  type GstSupplyType,
  type IndiaGstBreakdown,
  type IndiaGstInput,
  type IndiaGstLine,
} from "./tax/india-gst.js";
export type { TaxBreakdown, TaxComponent, TaxedLine, TaxEngine } from "./tax/tax-engine.js";
export {
  addDays,
  calendarDateIn,
  formatDateTime,
  instantAt,
  parseCalendarDate,
  parseTimeOfDay,
  startOfDayIn,
  timeOfDayIn,
  yearIn,
  type CalendarDate,
  type TimeOfDay,
} from "./time.js";
export { isUuid, newUuidV7 } from "./uuid.js";
export { addWorkingMinutes, type WorkingHours } from "./working-hours.js";
// GST facts and time zone names live with the API's field rules, so forms and the kernel share one copy.
export {
  gstinCheckCharacter,
  gstStateCodeFromGstin,
  gstStates,
  isGstStateCode,
  isUnionTerritoryWithoutLegislature,
  isValidGstin,
  isValidTimeZone,
  type GstStateCode,
} from "@travel-crm/contracts/kernel";
