// A tap in Try it: what pressing a card's button would do, worked out with no model and nothing written.
import type { LiveOffer } from "@travel-crm/contracts/ai";
import { stageAction, type ActionContext } from "../natural/tools/action-tools.js";
import type { LoopEnd } from "../natural/loop.js";

const staleNotice =
  'They tapped "Book these seats" but there is no live offer now. Nothing was booked. Say so, and offer again if they still want it.';
export const CHANGE_NOTICE = 'They tapped "Change something" on the offer. Ask what they\'d like to change.';

/** A Book tap held (the loop's end, as if the agent had booked) or a notice for the agent to answer. */
export type DryTap = { end: LoopEnd } | { notice: string };

/** Books the live offer's own terms through the usual checks; a refusal becomes the agent's notice. */
export async function dryBookTap(
  actions: Omit<ActionContext, "quotedThisTurn">,
  offer: LiveOffer | null,
): Promise<DryTap> {
  const label = [...actions.labels].find(([, packageId]) => packageId === offer?.packageId)?.[0];
  if (offer?.id === undefined || label === undefined) return { notice: staleNotice };
  const args = {
    trip_id: label,
    date: offer.startsOn,
    adults: offer.adults,
    children_ages: offer.childrenAges,
    ...(offer.room === null ? {} : { room: offer.room }),
    pay_in_full: offer.payInFull,
  };
  const outcome = await stageAction({ ...actions, quotedThisTurn: [] }, "book", args, "", { agent: "one" });
  if ("refused" in outcome) {
    return {
      notice: `They tapped "Book these seats" but it couldn't be held (${outcome.refused}). Nothing was booked.`,
    };
  }
  const { staged } = outcome;
  const figures = staged.tool === "book" ? [staged.figures] : [];
  return {
    end: {
      end: "final",
      messages: [],
      staged: new Map([[staged.tool, staged]]),
      quoted: figures,
      transcript: [],
      callsUsed: 0,
      model: "tap",
    },
  };
}
