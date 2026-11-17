// The one agent's tools as plain functions for the tool-agent port: a read answers at once, an action is checked and
// staged into the turn's run, and a call that fails or is refused answers in words the model can act on, never a throw.
import {
  naturalReadTools,
  parseOneToolArguments,
  type NaturalToolName,
  type OneMediaToolName,
  type OneToolName,
  type OneToolSchema,
} from "@travel-crm/contracts/ai";
import type { AgentTool } from "@travel-crm/integrations/tool-agent";
import { READ_FAILED, STAGE_FAILED, settled } from "../natural/loop/tool-calls.js";
import type { LoopIO, ReadToolName } from "../natural/loop/types.js";
import { withStaged, type StageOutcome } from "../natural/tools/action-tools.js";
import type { OneContext } from "./context.js";
import type { NaturalTraceBuilder } from "../natural/trace.js";
import type { QuoteFigures, StagedAction, StagedSet } from "../natural/types.js";

export interface OneRun {
  staged: StagedSet;
  /** The actions the model staged: only these end a turn without words. */
  modelStaged: Set<StagedAction["tool"]>;
  quoted: QuoteFigures[];
}

export interface OneToolIO {
  /** Natural's read tools, each in its own transaction. */
  read: LoopIO["read"];
  /** `stageAction` with `{ agent: "one" }`; `quoted` holds this turn's figures so far. */
  stage: (
    name: NaturalToolName,
    args: Record<string, unknown>,
    words: string,
    quoted: readonly QuoteFigures[],
  ) => Promise<StageOutcome>;
  /** The voice-note and photo tools, which read a stored file; absent where the turn can't (they answer refused). */
  media?: (name: OneMediaToolName, args: Record<string, unknown>) => Promise<string>;
}

const isMedia = (name: OneToolName): name is OneMediaToolName =>
  name === "transcribe_voice_note" || name === "look_at_image";
const isRead = (name: NaturalToolName): name is ReadToolName => naturalReadTools.includes(name);

/** A turn's run: code's own actions staged already, none of them the model's. */
export function startOneRun(forced: readonly StagedAction[]): OneRun {
  return { staged: new Map(forced.map((action) => [action.tool, action])), modelStaged: new Set(), quoted: [] };
}

/** The turn's tools as the port takes them; `tripLabels` are the labels the arguments may name. */
export function oneAgentTools(
  tools: readonly OneToolSchema[],
  io: OneToolIO,
  run: OneRun,
  trace: NaturalTraceBuilder,
  tripLabels: readonly string[],
  media: OneContext["media"] = new Map(),
): AgentTool[] {
  const failed = (name: string, error: string) => {
    trace.flag(`tool_failed:${name}:${error}`);
  };

  async function read(name: ReadToolName, args: Record<string, unknown>): Promise<string> {
    const answer = await settled(() => io.read(name, args));
    if ("failed" in answer) {
      failed(name, answer.failed);
      return READ_FAILED;
    }
    if (answer.value.figures !== null) run.quoted.push(answer.value.figures);
    return answer.value.result;
  }

  async function readMedia(name: OneMediaToolName, args: Record<string, unknown>): Promise<string> {
    if (io.media === undefined) return "refused: it can't be opened here; ask them to type it";
    const { media: read } = io;
    const answer = await settled(() => read(name, args));
    if ("failed" in answer) {
      failed(name, answer.failed);
      return READ_FAILED;
    }
    return answer.value;
  }

  async function stage(name: NaturalToolName, args: Record<string, unknown>, words: string): Promise<string> {
    const answer = await settled(() => io.stage(name, args, words, [...run.quoted]));
    if ("failed" in answer) {
      failed(name, answer.failed);
      return STAGE_FAILED;
    }
    const outcome = answer.value;
    if ("refused" in outcome) return outcome.refused;
    const { staged } = outcome;
    run.staged = withStaged(run.staged, staged);
    run.modelStaged.add(staged.tool);
    // An offer's or a booking's figures are this turn's too: the checks ground the words in them.
    if (staged.tool === "offer_booking" || staged.tool === "book") run.quoted.push(staged.figures);
    trace.staged(run.staged);
    return outcome.result;
  }

  const refs = (kind: "audio" | "image") => [...media].filter(([, one]) => one.kind === kind).map(([ref]) => ref);
  const voiceNotes = refs("audio");
  const photos = refs("image");

  return tools.map(({ name, description, schema }) => ({
    name,
    description,
    schema,
    async run(raw, { words }) {
      // The port only checks for an object, so each tool refuses its own bad arguments, in the domain's words.
      const parsed = parseOneToolArguments(name, raw, tripLabels, { voiceNotes, photos });
      if (!parsed.ok) return `refused: ${parsed.problem}`;
      if (isMedia(parsed.name)) return readMedia(parsed.name, parsed.args);
      if (isRead(parsed.name)) return read(parsed.name, parsed.args);
      return stage(parsed.name, parsed.args, words);
    },
  }));
}
