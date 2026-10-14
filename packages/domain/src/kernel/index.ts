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
