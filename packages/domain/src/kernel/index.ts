// Public API of the shared kernel: building blocks every domain module uses.
export { systemActor, type Actor, type ActorSource } from "./actor.js";
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
export {
  indiaGst,
  type GstSupplyType,
  type IndiaGstBreakdown,
  type IndiaGstInput,
  type IndiaGstLine,
} from "./tax/india-gst.js";
export type { TaxBreakdown, TaxComponent, TaxedLine, TaxEngine } from "./tax/tax-engine.js";
// GST registration facts live with the API's field rules, so forms and the tax engine share one list.
export {
  gstStateCodeFromGstin,
  gstStates,
  isGstStateCode,
  isUnionTerritoryWithoutLegislature,
  isValidGstin,
  type GstStateCode,
} from "@travel-crm/contracts/kernel";
