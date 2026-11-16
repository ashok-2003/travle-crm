// The tool calls of one response, in the model's order: a read runs and answers; an action is checked and staged, or
// refused with why and what to do instead. A call the turn didn't offer or the schema didn't allow, and a read or a check
// that failed (the database), come back as a refusal the model can act on, never a throw (Review Focus 2).
import { naturalReadTools, parseToolArguments, type NaturalToolName } from "@travel-crm/contracts/ai";
import type { AiToolCall } from "@travel-crm/integrations/ai";
import type { NaturalContext } from "../context/build.js";
import { withStaged } from "../tools/action-tools.js";
import type { NaturalTraceBuilder } from "../trace.js";
import type { LoopIO, ReadToolName, TurnRun } from "./types.js";

const READ_FAILED =
  "refused: that couldn't be read just now; answer from what you have, or say you'll check with the team and call " +
  "create_task";
const STAGE_FAILED = "refused: that couldn't be checked just now; say you'll check with the team and call create_task";

const isReadTool = (name: NaturalToolName): name is ReadToolName => naturalReadTools.includes(name);

/** What a response's calls came to: a read (the model is called again with it), a refusal. */
export interface CallsDone {
  read: boolean;
  refused: boolean;
}

interface Answer {
  result: string;
  read: boolean;
  refused: boolean;
  failed: boolean;
}

/** Runs the calls, adding each result to the run's messages and the trace; `words` are the response's (G6 reads them). */
export async function runToolCalls(
  calls: readonly AiToolCall[],
  words: string,
  turn: { context: NaturalContext; io: LoopIO; trace: NaturalTraceBuilder },
  run: TurnRun,
): Promise<CallsDone> {
  const done: CallsDone = { read: false, refused: false };
  for (const call of calls) {
    const answer = await answerOf(call, words, turn, run);
    run.messages.push({ role: "tool", toolCallId: call.id, content: answer.result });
    turn.trace.tool({ name: call.name, arguments: call.arguments, result: answer.result, refused: answer.refused });
    if (answer.failed) turn.trace.flag(`tool_failed:${call.name}`);
    done.read ||= answer.read;
    done.refused ||= answer.refused;
  }
  turn.trace.staged(run.staged);
  return done;
}

async function answerOf(
  call: AiToolCall,
  words: string,
  { context, io }: { context: NaturalContext; io: LoopIO },
  run: TurnRun,
): Promise<Answer> {
  const offered = context.tools.some((tool) => tool.name === call.name);
  const parsed = offered
    ? parseToolArguments(call.name, call.arguments, [...context.labels.keys()])
    : { ok: false as const, problem: `there is no tool called ${call.name}` };
  if (!parsed.ok) return { result: `refused: ${parsed.problem}`, read: false, refused: true, failed: false };
  const { name, args } = parsed;
  if (isReadTool(name)) {
    const read = await settled(() => io.read(name, args));
    if (read === null) return { result: READ_FAILED, read: true, refused: true, failed: true };
    if (read.figures !== null) run.quoted.push(read.figures);
    return { result: read.result, read: true, refused: read.result.startsWith("refused:"), failed: false };
  }
  const outcome = await settled(() => io.stage(name, args, words, [...run.quoted]));
  if (outcome === null) return { result: STAGE_FAILED, read: false, refused: true, failed: true };
  if ("refused" in outcome) return { result: outcome.refused, read: false, refused: true, failed: false };
  const { staged } = outcome;
  run.staged = withStaged(run.staged, staged);
  run.modelStaged.add(staged.tool);
  // An offer's or a booking's figures are this turn's too: G1 grounds them, G6 names the trip by them.
  if (staged.tool === "offer_booking" || staged.tool === "book") run.quoted.push(staged.figures);
  return { result: outcome.result, read: false, refused: false, failed: false };
}

/** The work's answer, or null when it threw (a database failure): the loop goes on without it. */
async function settled<T>(work: () => Promise<T>): Promise<T | null> {
  try {
    return await work();
  } catch {
    return null;
  }
}
