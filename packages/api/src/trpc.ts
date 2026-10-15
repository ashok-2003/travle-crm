// The api's tRPC instance: its context, and the error shape every response uses. The console has its own
// (platform/trpc.ts), with the same error shape.
import { initTRPC } from "@trpc/server";
import type { Context } from "./context.js";
import { errorShape } from "./errors.js";

/** What a procedure tells the request checks beyond its type (spec 7.3). */
export interface ProcedureMeta {
  /**
   * "export": a download of the organization's data, allowed while read-only and, to the Owner, while suspended.
   * "always": allowed in every lifecycle state, so the app can say why everything else is refused.
   */
  lifecycle?: "export" | "always";
}

export const t = initTRPC.context<Context>().meta<ProcedureMeta>().create({
  // tRPC adds the error's stack trace to responses unless NODE_ENV is "production". The api defaults to production, but
  // development and test set NODE_ENV differently, so this switch is explicit.
  isDev: false,
  errorFormatter: errorShape,
});

export const router = t.router;
