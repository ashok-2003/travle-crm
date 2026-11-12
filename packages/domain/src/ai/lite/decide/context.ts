// What the decide step reads: its input, the settled facts the move table works from, and what one rule picks.
import type { LiteFacts, LiteIntent } from "@travel-crm/contracts/ai";
import type { LeadStage } from "@travel-crm/contracts/crm";
import type { TurnKind } from "../../agent-prompt.js";
import type {
  CheckedForm,
  Decision,
  LeadNoteKey,
  Move,
  PackageIndexEntry,
  SaleStage,
  Situation,
  SituationPackage,
} from "../types.js";
import type { OpenBooking } from "./stage.js";

export interface DecideInput {
  kind: TurnKind;
  /** null when the turn hands over before Understand runs: a voice note, a customer who already has a booking. */
  checked: CheckedForm | null;
  /** The facts as the turn found them, and with the checked form merged in. */
  before: LiteFacts;
  facts: LiteFacts;
  burst: { kinds: string[]; question: boolean };
  /** Only `sellablePackages(...)` of kind group: every package the agent names comes from here. */
  index: PackageIndexEntry[];
  situation: Situation;
  adPackageId: string | null;
  openBooking: OpenBooking | null;
  hasBooking: boolean;
  mayBePayment: boolean;
  nameUsable: boolean;
  leadStage: LeadStage | null;
  /** known: destinations and indianTravelPlaces; unsold: destinations with no sellable package. */
  places: { known: string[]; unsold: string[] };
}

/** A total and advance for one departure: what was told, or may be told now. */
export type Quote = NonNullable<LiteFacts["quoted"]>;

export interface DecideContext {
  input: DecideInput;
  intents: ReadonlySet<LiteIntent>;
  /** The facts once settled: the ad's package, the departure on the day they gave, a stale quote let go. */
  facts: LiteFacts;
  /** The facts' package as the situation read it, or null. */
  pkg: SituationPackage | null;
  /** The total for exactly the settled facts, when the price has one. */
  quote: Quote | null;
  /** Whether any price, a total or a "from", can be told for the facts' package. */
  priced: boolean;
  stage: SaleStage;
}

/** One rule's pick: the move, its reason code, and what else it sets. */
export interface Picked {
  move: Move;
  why: string;
  facts?: Partial<LiteFacts>;
  stopFollowUps?: boolean;
  note?: LeadNoteKey;
  task?: NonNullable<Decision["task"]>;
  suggest?: NonNullable<Decision["suggest"]>;
}
