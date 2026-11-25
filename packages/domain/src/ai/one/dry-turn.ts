// One turn of the one agent as a dry run (Try it): natural's dry turn with the one loop. Reads and checks run on the
// agency's data; actions are staged and described, never done. Nobody writes during it, so no newer line gives way.
import { naturalFacts, type NaturalTestAnswer } from "@travel-crm/contracts/ai";
import type { OrgTx } from "@travel-crm/db";
import type { ToolAgent } from "@travel-crm/integrations/tool-agent";
import { newLinesOf } from "../natural/context/chat-turns.js";
import { countedModel } from "../natural/counted-model.js";
import { dryAgency } from "../natural/dry-agency.js";
import { isText } from "../natural/trips/trip-text.js";
import { dryTap } from "./dry-tap.js";
import { dryAnswerOf } from "../natural/dry-answer.js";
import {
  dryActionContext,
  dryLeadView,
  EMPTY_DRY_LEAD,
  type NaturalDryDependencies,
  type NaturalDryTurn,
} from "../natural/dry-turn.js";
import { guardReads, readTools } from "../natural/turn-reads.js";
import type { ReadContext } from "../natural/tools/read-tools.js";
import { startNaturalTrace } from "../natural/trace.js";
import { oneBeforeTheModel } from "./before-the-model.js";
import { buildOneContext } from "./context.js";
import { runOneLoop } from "./loop.js";
import { stageOneAction } from "./tools.js";

export async function oneDryTurn(
  deps: NaturalDryDependencies & { toolAgent: ToolAgent },
  organizationId: string,
  turn: NaturalDryTurn & { tap?: "book" | "change" },
): Promise<NaturalTestAnswer> {
  const { db } = deps;
  const clock = deps.clock ?? Date.now;
  const startedMs = clock();
  const { now, lines } = turn;
  const agency = await dryAgency(db, organizationId, await deps.agencyName(organizationId), now);
  const { timeZone, today, sheets } = agency;
  const state = turn.state ?? { facts: naturalFacts.parse({ agent: "natural" }), lead: EMPTY_DRY_LEAD };
  const { facts } = state;
  const before = oneBeforeTheModel(newLinesOf(lines, facts.lastTurnAt === null ? null : new Date(facts.lastTurnAt)));
  const contextWith = (notice: string | null) =>
    buildOneContext({
      prompt: turn.prompt,
      voice: agency.voice,
      timeZone,
      today,
      now,
      answers: agency.answers,
      contact: agency.contact,
      sheets,
      lead: dryLeadView(state.lead),
      facts,
      lines,
      cameFrom: null,
      notice,
      tools: "all",
      summary: null,
    });
  let context = contextWith(before.notice);
  // The read tools keep a trip read whole in these reads; one has no word guards to use them.
  const reads = guardReads(agency, lines, facts, now);
  const readContext = (tx: OrgTx): ReadContext => ({ tx, sheets, labels: context.labels, today, now });
  const actions = dryActionContext({
    db,
    organizationId,
    agency,
    state,
    labels: context.labels,
    newLines: context.newLines,
    lines,
    now,
    readContext,
  });
  const trace = startNaturalTrace(turn.prompt, startedMs, "one");
  const tapped = turn.tap === undefined ? null : await dryTap(turn.tap, state, actions, lines);
  if (tapped !== null && "notice" in tapped) {
    context = contextWith([before.notice, tapped.notice].filter(isText).join("\n"));
  }
  const end =
    tapped !== null && "end" in tapped
      ? tapped.end
      : await runOneLoop(
          context,
          {
            agent: deps.toolAgent,
            call: countedModel(deps.ai, { db, organizationId, now, timeZone }),
            read: readTools(db, organizationId, readContext, reads),
            stage: (name, args, words, quoted) =>
              stageOneAction({ ...actions, quotedThisTurn: quoted }, name, args, words),
            newerLine: () => Promise.resolve(false),
            clock,
          },
          { organizationId, ...turn.choice, forced: before.forced, today },
          trace,
        );
  const newText = context.newLines.map((line) => line.text).join("\n");
  return dryAnswerOf(end, { now, today, sheets, paymentLines: agency.paymentLines, state, newText }, trace, clock());
}
