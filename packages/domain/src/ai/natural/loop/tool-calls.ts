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
  "refused: that couldn't be read just now; answer from what you have, or say you'll check and come back, and " +
  "call create_task";
const STAGE_FAILED = "refused: that couldn't be checked just now; say you'll check and come back, and call create_task";

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
  /** The error's name when the read or the check threw: an outage reads apart from a bug in "Why". */
  failed: string | null;
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
    if (answer.failed !== null) turn.trace.flag(`tool_failed:${call.name}:${answer.failed}`);
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
  if (!parsed.ok) return { result: `refused: ${parsed.problem}`, read: false, refused: true, failed: null };
  const { name, args } = parsed;
  if (isReadTool(name)) {
    const read = await settled(() => io.read(name, args));
    if ("failed" in read) return { result: READ_FAILED, read: true, refused: true, failed: read.failed };
    const { result, figures } = read.value;
    if (figures !== null) run.quoted.push(figures);
    return { result, read: true, refused: result.startsWith("refused:"), failed: null };
  }
  const staging = await settled(() => io.stage(name, args, words, [...run.quoted]));
  if ("failed" in staging) return { result: STAGE_FAILED, read: false, refused: true, failed: staging.failed };
  const outcome = staging.value;
  if ("refused" in outcome) return { result: outcome.refused, read: false, refused: true, failed: null };
  const { staged } = outcome;
  run.staged = withStaged(run.staged, staged);
  run.modelStaged.add(staged.tool);
  // An offer's or a booking's figures are this turn's too: G1 grounds them, G6 names the trip by them.
  if (staged.tool === "offer_booking" || staged.tool === "book") run.quoted.push(staged.figures);
  return { result: outcome.result, read: false, refused: false, failed: null };
}

/** The work's answer, or the name of what it threw (a database failure): the loop goes on without it. */
async function settled<T>(work: () => Promise<T>): Promise<{ value: T } | { failed: string }> {
  try {
    return { value: await work() };
  } catch (error) {
    return { failed: error instanceof Error ? error.name : "unknown" };
  }
}
