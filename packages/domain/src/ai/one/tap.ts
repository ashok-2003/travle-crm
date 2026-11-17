// A tap on the offer card (spec 7.1; BT5, BT6). Only a reply button's id is a tap (the inbox keeps no other), and only
// `book:` or `change:` with an offer id. Book on the chat's live offer, the turn's only new line, stages `book` on that
// offer's own terms, with its checks (seats free, price unchanged, nothing booked ahead) and the card's advance, and
// acts at once with no model: a fixed line in the customer's language, then the payment message and the QR, under the
// turn's tokens, so a job run twice books and sends nothing more. Change, a tap on an offer no longer live, a tap with
// other lines and a refused tap go to the agent as a notice.
import type { LiveOffer } from "@travel-crm/contracts/ai";
import { formatRupees, isUuid } from "../../kernel/index.js";
import { fenced } from "../fenced.js";
import { languageOf } from "../natural/fallback-line.js";
import { stageAction, type ActionContext } from "../natural/tools/action-tools.js";
import { awaitsPayment, liveOfferOf } from "../natural/tools/booking-checks.js";
import { termsWords } from "../natural/tools/terms.js";
import { actOnTurn, type LiveTurn, type TurnAct } from "../natural/turn-act.js";
import { doneOf, type TurnDone } from "../natural/turn-done.js";
import { refusalNote } from "../natural/turn-refused.js";
import { BOOK_TITLE, CHANGE_TITLE, tapOf } from "./card.js";

/** The turn ended on the tap's booking, the model runs with a notice, or null: the message is no tap. */
export type TapStep = { done: TurnDone } | { notice: string } | null;
type Actions = Omit<ActionContext, "quotedThisTurn">;

const NOTHING_SENT = "Nothing was sent; reply again.";
const BOOKED = {
  english: "Your seats are held. The payment details are below.",
  hinglish: "Aapki seats hold ho gayi hain, payment ki details neeche hain.",
  hindi: "आपकी सीटें होल्ड हो गई हैं, पेमेंट की डिटेल नीचे है।",
};

/** The fixed line a Book tap's hold goes with (BT5), before the payment message and the QR. */
export function tapBookedLine(language: "hindi" | "hinglish" | "english"): string {
  return BOOKED[language];
}

/** The answered message's tap, with the words of the card it was on in this chat (none found: null); null for no tap. */
async function tapRead({ deps, input }: LiveTurn) {
  if (!isUuid(input.token)) return null;
  return deps.db.forOrg(input.organizationId, async (tx) => {
    const message = await tx.whatsappMessage.findFirst({
      where: { id: input.token, conversationId: input.conversationId, direction: "in" },
      select: { buttonReplyId: true },
    });
    const tap = tapOf(message?.buttonReplyId ?? null);
    if (tap === null) return null;
    const card = await tx.whatsappMessage.findFirst({
      where: {
        conversationId: input.conversationId,
        direction: "out",
        buttons: { array_contains: [{ id: `book:${tap.offerId}` }] },
      },
      select: { body: true },
    });
    // The card's text is code's, from its offer: one line, with the title's stars gone.
    const body = card?.body ?? null;
    return { ...tap, card: body === null ? null : fenced(body.replaceAll("*", "").split("\n").join("; ")) };
  });
}

const offerWords = (offer: LiveOffer, actions: Actions) =>
  `${termsWords(offer, actions.sheets, actions.today)}, total ${formatRupees(offer.totalPaise)}`;

/** The customer's last lines before the tap that set the fixed line's language, as the prompt's rule follows them. */
const LATEST_LINES = 3;

/** The language of the customer's latest lines before the tap: the tap's own words are the button's. */
function languageBefore({ input, prepared }: LiveTurn) {
  const at = prepared.lines.findIndex((line) => line.id === input.token);
  const before = at === -1 ? prepared.lines : prepared.lines.slice(0, at);
  const theirs = before.filter((line) => line.from === "customer").slice(-LATEST_LINES);
  return languageOf(theirs.map((line) => line.text).join("\n"));
}

/** Book on the live offer: `book`'s checks and the card's advance, then the act with the fixed line, or a notice. */
async function bookOffer(turn: LiveTurn, actions: Actions, offer: LiveOffer): Promise<TapStep> {
  const label = [...actions.labels].find(([, packageId]) => packageId === offer.packageId)?.[0];
  const terms = {
    trip_id: label ?? "",
    date: offer.startsOn,
    adults: offer.adults,
    children_ages: offer.childrenAges,
    ...(offer.room === null ? {} : { room: offer.room }),
    pay_in_full: offer.payInFull,
  };
  const outcome =
    label === undefined
      ? { refused: "refused: the trip isn't on sale now" }
      : await stageAction({ ...actions, quotedThisTurn: [] }, "book", terms, "", { agent: "one" });
  const tapped = `They tapped "${BOOK_TITLE}" on the offer (${offerWords(offer, actions)}).`;
  // The stage's refusal names its own open dates.
  const couldNot = (why: string) => ({ notice: `${tapped} The seats couldn't be held: ${why}. ${NOTHING_SENT}` });
  if ("refused" in outcome) return couldNot(outcome.refused.replace(/^refused: /u, ""));
  const { staged } = outcome;
  // The card showed its advance: one the trip asks differently now isn't what they tapped on.
  const advance = staged.tool === "book" ? staged.figures.advancePaise : offer.advancePaise;
  if (!offer.payInFull && advance !== offer.advancePaise) {
    return couldNot(
      `the advance changed since the offer: it is now ${formatRupees(advance)}; make the offer again with offer_booking`,
    );
  }
  const act: TurnAct = {
    messages: [tapBookedLine(languageBefore(turn))],
    staged: new Map([[staged.tool, staged]]),
    quoted: [],
    handOver: null,
    task: null,
    model: null,
    fallback: null,
  };
  const result = await actOnTurn(turn, act);
  if ("refused" in result) return { notice: `${tapped} ${await refusalNote(turn, act.staged, result)}` };
  return { done: doneOf(turn, act, result) };
}

/** Reads the answered message's tap (input.token's button_reply_id) and books, or says what the model must know. */
export async function tapStep(turn: LiveTurn, actions: Actions): Promise<TapStep> {
  const tap = await tapRead(turn);
  if (tap === null) return null;
  const live = liveOfferOf(actions);
  // An offer stored with no id is never the one tapped.
  const tappedLive = live !== null && live.id === tap.offerId ? live : null;
  const tapped = tappedLive === null ? tap.card : offerWords(tappedLive, actions);
  const on = tapped === null ? "" : ` (${tapped})`;
  if (tap.button === "change") {
    return { notice: `They tapped "${CHANGE_TITLE}" on the offer${on}. Ask what they'd like to change.` };
  }
  if (tappedLive === null) {
    const now = live === null ? "There is no live offer now." : `The live offer is ${offerWords(live, actions)}.`;
    const then = awaitsPayment(actions.booking)
      ? "Their booking is already held and waits for payment. Say so; resend_payment sends the payment details again " +
        "if they ask."
      : "Say so, and offer again if they still want it.";
    return {
      notice: `They tapped "${BOOK_TITLE}" on an offer that is no longer live${on}. Nothing was booked. ${now} ${then}`,
    };
  }
  // They wrote more with the tap (a question, another party): the model reads it all, and books if they still want it.
  if (actions.newLines.length > 1) {
    return {
      notice:
        `They tapped "${BOOK_TITLE}" on the live offer${on} and wrote more. Nothing is booked yet: answer what they ` +
        "wrote, and book on these terms if they still want them.",
    };
  }
  return bookOffer(turn, actions, tappedLive);
}
