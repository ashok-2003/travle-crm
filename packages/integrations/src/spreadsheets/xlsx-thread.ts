// The .xlsx read's own thread (D1, ADR 0030): the whole read (the bounded unpack, the first sheet, its sizing and
// read-excel-file) runs here, within the heap, stack and time read-xlsx-in-thread.ts gives it, so a file no sizing
// foresaw costs this thread alone, never the worker every agency shares. It answers once and ends.
import { registerHooks } from "node:module";
import { parentPort, workerData } from "node:worker_threads";
import type { XlsxThreadAnswer, XlsxThreadInput } from "./xlsx-thread-messages.js";

// From the TypeScript source (development and tests), plain Node runs this thread: it strips the types but doesn't
// find a ".ts" file by the ".js" name our imports give it, so this does. The api's bundle runs xlsx-thread.mjs instead.
if (import.meta.url.endsWith(".ts")) {
  registerHooks({
    resolve(specifier, context, nextResolve) {
      try {
        return nextResolve(specifier, context);
      } catch (error) {
        if (!specifier.startsWith(".") || !specifier.endsWith(".js")) throw error;
        return nextResolve(`${specifier.slice(0, -".js".length)}.ts`, context);
      }
    },
  });
}

// Imported once the names resolve, which is why they are imported here and not above.
const { readXlsx } = await import("./read-xlsx.js");
const { SpreadsheetUnreadableError } = await import("./spreadsheets.js");

const input = workerData as XlsxThreadInput;
const answer = (message: XlsxThreadAnswer) => {
  parentPort?.postMessage(message);
};
try {
  answer({ sheet: await readXlsx(new Uint8Array(input.bytes), input.limits) });
} catch (error) {
  if (error instanceof SpreadsheetUnreadableError) answer({ unreadable: error.reason });
  // The stack ran out, or an array or string grew past what V8 allows: the file is too much to open.
  else if (error instanceof RangeError) answer({ unreadable: "too_large_unpacked" });
  else throw error;
}
