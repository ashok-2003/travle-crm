// The api's tRPC instance: its context, and the error shape every response uses. The console has its own
// (platform/trpc.ts), with the same error shape.
import { initTRPC } from "@trpc/server";
import type { Context } from "./context.js";
import { errorShape } from "./errors.js";

export const t = initTRPC.context<Context>().create({
  // tRPC adds the error's stack trace to responses unless NODE_ENV is "production". The api defaults to production, but
  // development and test set NODE_ENV differently, so this switch is explicit.
  isDev: false,
  errorFormatter: errorShape,
});

export const router = t.router;
