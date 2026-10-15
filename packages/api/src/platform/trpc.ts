// The platform console's own tRPC instance: its context differs from the api's, its error shape doesn't.
import { initTRPC } from "@trpc/server";
import { errorShape } from "../errors.js";
import type { PlatformContext } from "./context.js";

export const platformT = initTRPC.context<PlatformContext>().create({
  // As in the api: no stack traces in responses, whatever NODE_ENV says.
  isDev: false,
  errorFormatter: errorShape,
});
