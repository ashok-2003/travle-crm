// The move table (spec Step 5, F5), the only way an intent becomes an action. The first rule that applies picks the
// move; the order is also the intents' rank, so when the customer's words carry two, the higher one decides.
import { inAnotherScript } from "../../grounded/phrase-match.js";
import { containsWords } from "../../grounded/read-words.js";
import { findPackages } from "../lookups/find-packages.js";
import type { SituationPackage } from "../types.js";
import type { DecideContext, Picked } from "./context.js";
import { askMove, datesMove, fixedLine, handOver, priceMove, seatsFor } from "./moves.js";
import { nextItem } from "./stage.js";
import { handOverTrigger } from "./triggers.js";

type Rule = (context: DecideContext) => Picked | null;

const MOST_SHOWN = 3;
/** The contract keeps the last ten places the agency doesn't run. */
const MOST_NOT_RUN = 10;
const MEDIA = new Set(["image", "video", "document"]);
const ASKS_SEATS = ["wants_to_book", "price_question", "gives_details"] as const;

const firstTrips = (context: DecideContext) => context.input.index.slice(0, MOST_SHOWN).map((entry) => entry.id);
/** The question a reply ends with: the next checklist item, the name first when it is still wanted (K1). */
const nextAsk = (context: DecideContext) => nextItem(context.facts, context.pkg, context.input.nameUsable, false);
/** A question about the trip needs one: none asks which, one the situation couldn't read goes to a person. */
function aboutPackage(context: DecideContext, why: string, answer: (pkg: SituationPackage) => Picked): Picked {
  if (context.facts.packageId === null) return askMove(context, "where");
  return context.pkg === null ? handOver("unanswered", why) : answer(context.pkg);
}

const trigger: Rule = ({ input, intents, facts }) => {
  const burstKinds = input.burst.kinds;
  const reason = handOverTrigger({ burstKinds, hasBooking: input.hasBooking, intents: [...intents], facts });
  if (reason === null) return null;
  return {
    ...handOver(reason, `trigger:${reason}`),
    ...(reason === "wants_call" ? { task: "call_back" as const } : {}),
  };
};

const media: Rule = ({ input }) => {
  if (!input.burst.kinds.some((kind) => MEDIA.has(kind))) return null;
  const payment = input.openBooking !== null || input.mayBePayment;
  return payment ? fixedLine("screenshot_received", "trigger:screenshot") : handOver("image", "trigger:image");
};

const paymentSent: Rule = ({ intents, stage }) => {
  if (!intents.has("payment_sent")) return null;
  return fixedLine(stage === "payment_to_check" ? "screenshot_received" : "ask_screenshot", "intent:payment_sent");
};

const notInterested: Rule = ({ intents }) => {
  if (!intents.has("not_interested")) return null;
  const suggest = { kind: "lost" as const, lostReason: "other" as const, reason: "Said they're not interested." };
  return { ...fixedLine("close", "intent:not_interested"), stopFollowUps: true, note: "not_interested", suggest };
};

const newPlace: Rule = (context) => {
  const { facts, input } = context;
  const words = facts.placeWords;
  if (words === null || words === input.before.placeWords || facts.packageId !== null) return null;
  const confirm = (packageIds: string[]): Picked => ({
    move: { kind: "confirm_place", packageIds },
    why: "place:confirm",
  });
  const found = findPackages(input.index, words);
  if (found.exact.length > 0) return confirm(found.exact.map((entry) => entry.id));
  // A near spelling of a trip we run ("Kedarkantha") is asked about, never called a place we don't run.
  if (found.closest.length > 0) return confirm(found.closest.map((entry) => entry.id));
  const places = [...input.places.known, ...input.places.unsold];
  if (inAnotherScript(words) || !places.some((place) => containsWords(words, place))) {
    return confirm(firstTrips(context));
  }
  const notRun = [...facts.notRun.filter((one) => one !== words), words].slice(-MOST_NOT_RUN);
  return { ...fixedLine("not_run", "place:not_run"), facts: { notRun, notRunAsked: true } };
};

const otherTrips: Rule = (context) => {
  const answer = context.input.checked?.form.open_to_other_trips ?? "unknown";
  if (!context.facts.notRunAsked || answer === "unknown") return null;
  const asked = { notRunAsked: false };
  if (answer === "yes") {
    return {
      move: { kind: "show_other_trips", packageIds: firstTrips(context) },
      why: "place:other_trips",
      facts: asked,
    };
  }
  const suggest = { kind: "lost" as const, lostReason: "other" as const, reason: "Wanted a trip you don't run." };
  return { ...fixedLine("close", "place:no_other_trips"), facts: asked, stopFollowUps: true, suggest };
};

const payment: Rule = (context) => {
  const { intents, stage, facts, pkg } = context;
  const booking = intents.has("wants_to_book");
  if (booking && stage === "waiting_for_payment")
    return { move: { kind: "resend_payment" }, why: "intent:wants_to_book" };
  if (booking && stage === "payment_to_check") return fixedLine("screenshot_received", "intent:wants_to_book");
  if (!ASKS_SEATS.some((one) => intents.has(one)) || facts.adults === null) return null;
  const chosen = pkg?.departures.find((one) => one.id === facts.departureId);
  if (chosen === undefined || chosen.freeSeats >= seatsFor(facts)) return null;
  // Spec A9: the nearest dates that have the seats. The full one goes, with its day, so the next turn doesn't pick it again.
  const letGo = { departureId: null, day: null, quoted: null };
  return datesMove(context, { day: chosen.startsOn, month: null }, "when", "seats:too_few", letGo);
};

const wantsToBook: Rule = (context) => {
  if (!context.intents.has("wants_to_book")) return null;
  // The name is no step of booking (it was asked first, or skipped); the full name comes last, and only once.
  const next = nextItem(context.facts, context.pkg, true, true);
  if (next === "full_name") {
    return {
      move: { kind: "ask_detail", item: next, choices: [] },
      why: "checklist:full_name",
      facts: { fullNameAsked: true },
    };
  }
  if (next !== null) return askMove(context, next);
  const { pkg, quote } = context;
  if (pkg === null || quote === null) return handOver("unanswered", "price:missing");
  return { move: { kind: "book", packageId: pkg.id, departureId: quote.departureId }, why: "intent:wants_to_book" };
};

const priceQuestion: Rule = (context) => {
  const why = "intent:price_question";
  if (!context.intents.has("price_question")) return null;
  return aboutPackage(context, why, () => priceMove(context, nextAsk(context), why));
};

const datesQuestion: Rule = (context) => {
  const why = "intent:dates_question";
  if (!context.intents.has("dates_question")) return null;
  const { day, month } = context.facts;
  return aboutPackage(context, why, () => datesMove(context, { day, month }, nextAsk(context), why));
};

const packageQuestion: Rule = (context) => {
  const why = "intent:package_question";
  if (!context.intents.has("package_question")) return null;
  return aboutPackage(context, why, (pkg) => ({
    move: { kind: "answer_package", packageId: pkg.id, ask: nextAsk(context) },
    why,
  }));
};

const agencyQuestion: Rule = (context) => {
  const why = "intent:agency_question";
  if (!context.intents.has("agency_question")) return null;
  const [topic] = context.input.situation.looked.flatMap(({ result }) =>
    "answer" in result && (result.answer ?? "").trim() !== "" ? [result.topic] : [],
  );
  if (topic === undefined) return handOver("unanswered", why);
  return { move: { kind: "answer_agency", topic, ask: nextAsk(context) }, why };
};

const identity: Rule = ({ intents }) =>
  intents.has("asks_who_you_are") ? fixedLine("identity", "intent:asks_who_you_are") : null;

const later: Rule = ({ intents }) =>
  intents.has("later")
    ? { ...fixedLine("later", "intent:later"), stopFollowUps: true, note: "later", task: "decide_later" }
    : null;

const givesDetails: Rule = (context) => {
  if (!context.intents.has("gives_details")) return null;
  const next = nextAsk(context);
  if (next !== null) return askMove(context, next);
  return context.quote === null
    ? handOver("unanswered", "price:missing")
    : priceMove(context, null, "intent:gives_details");
};

const hello: Rule = ({ intents, facts, input }) => {
  if (!intents.has("hello")) return null;
  const all = input.index.length <= MOST_SHOWN ? input.index.map((entry) => entry.id) : [];
  return {
    move: { kind: "greet", packageIds: facts.packageId === null ? all : [facts.packageId] },
    why: "intent:hello",
  };
};

const okThanks: Rule = (context) => {
  if (!context.intents.has("ok_thanks")) return null;
  const pending = context.input.before.asked[0]?.item ?? null;
  // A name let go after two asks is pending no more: the next detail is (F2 replies only while a question waits).
  const item = pending === "name" && context.facts.nameSkipped ? nextAsk(context) : pending;
  return item === null ? { move: { kind: "silent" }, why: "silence", stopFollowUps: true } : askMove(context, item);
};

const other: Rule = (context) => {
  if (!context.intents.has("other")) return null;
  if (context.input.burst.question) return handOver("unanswered", "intent:other");
  if (context.facts.otherInARow >= 1) return handOver("other_twice", "intent:other");
  return { ...fixedLine("how_can_i_help", "intent:other"), facts: { otherInARow: context.facts.otherInARow + 1 } };
};

const RULES: Rule[] = [
  trigger,
  media,
  paymentSent,
  notInterested,
  newPlace,
  otherTrips,
  payment,
  wantsToBook,
  priceQuestion,
  datesQuestion,
  packageQuestion,
  agencyQuestion,
  identity,
  later,
  givesDetails,
  hello,
  okThanks,
  other,
];

export function pickMove(context: DecideContext): Picked {
  for (const rule of RULES) {
    const picked = rule(context);
    if (picked !== null) return picked;
  }
  // No intent at all: only a turn that skipped Understand without a trigger, which the turn never makes.
  return handOver("unanswered", "intent:none");
}
