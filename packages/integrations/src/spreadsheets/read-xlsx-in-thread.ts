// Reads an .xlsx in a thread of its own (D1, ADR 0030), so no file can take down the worker every agency shares: the
// sizing refuses what it foresees fast, and whatever it doesn't foresee runs out this thread's heap (128 MB), stack or
// time (a minute) alone. Either is "too large once opened"; a thread that can't run at all is our error, named by its
// code alone (a job's error is shown to platform staff, and an error's message may quote the file).
import { Worker } from "node:worker_threads";
import { type ReadLimits, type ReadSheet, SpreadsheetUnreadableError } from "./spreadsheets.js";
import type { XlsxThreadAnswer, XlsxThreadInput } from "./xlsx-thread-messages.js";

export interface XlsxThreadOptions {
  /** The thread's module; tests point it elsewhere. */
  file: URL;
  timeoutMs: number;
}

/**
 * The thread's module beside this one: the TypeScript source in development and tests, and in the api's bundle the
 * entry apps/api/scripts/bundle.ts writes beside the chunk holding this code.
 */
const threadFile = new URL(import.meta.url.endsWith(".ts") ? "./xlsx-thread.ts" : "./xlsx-thread.mjs", import.meta.url);

/**
 * The largest file the import limits take (10,000 rows of 50 columns) reads in about 1.5 seconds on a laptop, so ten
 * times that or more on the pilot's host, a tenth of a CPU: a minute stops a runaway read without refusing that file.
 */
export const defaultXlsxThreadOptions: XlsxThreadOptions = { file: threadFile, timeoutMs: 60_000 };

/** A read within the import limits needs far less (limits.test.ts reads 10,000 rows of 50 columns in it). */
const resourceLimits = { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 16, stackSizeMb: 4 };

const codeOf = (error: unknown) =>
  error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : "unknown";

export function readXlsxInThread(
  bytes: Uint8Array,
  limits: ReadLimits,
  options: XlsxThreadOptions = defaultXlsxThreadOptions,
): Promise<ReadSheet> {
  // A copy of its own to hand over: the caller's array may be a view of a larger buffer, such as Node's pool of small
  // Buffers, which can't be handed over.
  const handedOver = new Uint8Array(bytes).buffer;
  const input: XlsxThreadInput = { bytes: handedOver, limits };
  return new Promise((resolve, reject) => {
    const worker = new Worker(options.file, { workerData: input, transferList: [handedOver], resourceLimits });
    const state = { settled: false };
    const settle = (finish: () => void) => {
      if (state.settled) return;
      state.settled = true;
      clearTimeout(timer);
      void worker.terminate();
      finish();
    };
    const tooLarge = () => {
      reject(new SpreadsheetUnreadableError("too_large_unpacked"));
    };
    const timer = setTimeout(() => {
      settle(tooLarge);
    }, options.timeoutMs);
    worker.on("message", (answer: XlsxThreadAnswer) => {
      settle(() => {
        if ("sheet" in answer) resolve(answer.sheet);
        else reject(new SpreadsheetUnreadableError(answer.unreadable));
      });
    });
    worker.on("error", (error) => {
      settle(() => {
        const code = codeOf(error);
        if (code === "ERR_WORKER_OUT_OF_MEMORY") tooLarge();
        else reject(new Error(`The .xlsx reader's thread failed: ${code}`));
      });
    });
    worker.on("exit", (exitCode) => {
      settle(() => {
        reject(new Error(`The .xlsx reader's thread ended without an answer: ${String(exitCode)}`));
      });
    });
  });
}
