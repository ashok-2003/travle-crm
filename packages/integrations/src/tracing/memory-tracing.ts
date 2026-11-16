// The in-memory tracing adapter: keeps each turn with the notes and model calls made in its async context, as the Langfuse
// adapter nests them, so a test reads what a turn would have sent. A note outside any turn is kept apart: the real adapter
// drops it.
import { AsyncLocalStorage } from "node:async_hooks";
import {
  failureOf,
  type AiTracing,
  type GenerationEnd,
  type GenerationStart,
  type TraceNote,
  type TurnStart,
} from "./ai-tracing.js";

export interface MemoryGeneration {
  start: GenerationStart;
  end: GenerationEnd | null;
  /** The turn it ran in, or null outside any. */
  turn: MemoryTurn | null;
}

export interface MemoryTurn {
  start: TurnStart;
  notes: TraceNote[];
  generations: MemoryGeneration[];
  /** The work's error by name and code, when it threw. */
  failure: string | null;
  ended: boolean;
}

export interface MemoryTracing extends AiTracing {
  readonly turns: MemoryTurn[];
  /** Every model call, inside a turn or not. */
  readonly generations: MemoryGeneration[];
  readonly strayNotes: TraceNote[];
  readonly flushes: number;
  readonly shutDown: boolean;
}

export function createMemoryTracing(): MemoryTracing {
  const running = new AsyncLocalStorage<MemoryTurn>();
  const turns: MemoryTurn[] = [];
  const generations: MemoryGeneration[] = [];
  const strayNotes: TraceNote[] = [];
  let flushes = 0;
  let shutDown = false;
  return {
    turns,
    generations,
    strayNotes,
    get flushes() {
      return flushes;
    },
    get shutDown() {
      return shutDown;
    },
    turn(start, work) {
      const turn: MemoryTurn = { start, notes: [], generations: [], failure: null, ended: false };
      turns.push(turn);
      return running.run(turn, async () => {
        try {
          return await work();
        } catch (error) {
          turn.failure = failureOf(error);
          throw error;
        } finally {
          turn.ended = true;
        }
      });
    },
    note(note) {
      const turn = running.getStore();
      (turn?.notes ?? strayNotes).push(note);
    },
    generation(start) {
      const turn = running.getStore() ?? null;
      const call: MemoryGeneration = { start, end: null, turn };
      generations.push(call);
      turn?.generations.push(call);
      return {
        end(result) {
          call.end ??= result;
        },
      };
    },
    flush() {
      flushes += 1;
      return Promise.resolve();
    },
    shutdown() {
      shutDown = true;
      return Promise.resolve();
    },
  };
}
