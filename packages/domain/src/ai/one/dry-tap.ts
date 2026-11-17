// A tap in Try it: what pressing a card's button would do, read and staged by a live tap's own code (tap.ts), with no
// model and nothing written.
import type { NaturalTestState } from "@travel-crm/contracts/ai";
import type { ActionContext } from "../natural/tools/action-tools.js";
import type { LoopEnd } from "../natural/loop.js";
import type { NaturalChatLine } from "../natural/types.js";
import { languageBefore, readTap, stageTapBook, tapBookedLine } from "./tap.js";

/** A Book tap held (the loop's end, with the fixed line) or a notice for the agent to answer. */
export type DryTap = { end: LoopEnd } | { notice: string };

export async function dryTap(
  button: "book" | "change",
  state: NaturalTestState,
  actions: Omit<ActionContext, "quotedThisTurn">,
  lines: readonly NaturalChatLine[],
): Promise<DryTap> {
  // The state's offer is the card the test chat last showed.
  const read = readTap({ button, offerId: state.facts.offer?.id ?? "", card: null }, actions);
  if ("notice" in read) return read;
  const stage = await stageTapBook(actions, read.book);
  if ("notice" in stage) return stage;
  const { staged } = stage;
  const tapLine = lines.at(-1)?.id ?? "";
  return {
    end: {
      end: "final",
      messages: [tapBookedLine(languageBefore(lines, tapLine))],
      staged: new Map([[staged.tool, staged]]),
      quoted: [],
      transcript: [],
      callsUsed: 0,
      model: "tap",
    },
  };
}
