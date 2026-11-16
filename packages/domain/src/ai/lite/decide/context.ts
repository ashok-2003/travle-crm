// What the decide step reads: its input, the settled facts the move table works from, and what one rule picks.
import type { LiteFacts, LiteIntent } from "@travel-crm/contracts/ai";
import type { LeadStage } from "@travel-crm/contracts/crm";
import type { TurnKind } from "../../may-write.js";
import type {
  CheckedForm,
  Decision,
  DepartureLine,
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
  /** The customer's newest words contradict a trip field a person typed on the lead: a person reconciles it. */
  detailsChanged: boolean;
  mayBePayment: boolean;
  nameUsable: boolean;
  leadStage: LeadStage | null;
  /**
   * known: destinations and indianTravelPlaces; unsold: destinations with no sellable package. Decide no longer reads
   * it (D2: any place with no trip near its name gets "we don't run that"); the turn passes it on to the reply check.
   */
  places: { known: string[]; unsold: string[] };
  /** A nudge's: the follow-ups this silence has had (0 or 1). A reply turn leaves it out. */
  followUpsSent?: number;
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
  /**
   * The facts' departure as the price read it, the one place its free seats are known (the package's list stops at 20);
   * null when none is chosen or it is no longer open.
   */
  departure: DepartureLine | null;
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
