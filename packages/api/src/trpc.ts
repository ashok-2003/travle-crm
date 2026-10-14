// The api's one tRPC instance: its context, and the error shape every response uses.
import { initTRPC } from "@trpc/server";
import type { Context } from "./context.js";
import { errorDetails, publicMessage } from "./errors.js";

export const t = initTRPC.context<Context>().create({
  errorFormatter: ({ shape, error }) => ({
    ...shape,
    message: publicMessage(error),
    data: { ...shape.data, ...errorDetails(error) },
  }),
});

export const router = t.router;
