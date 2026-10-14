// The api's one tRPC instance: its context, and the error shape every response uses.
import { initTRPC } from "@trpc/server";
import type { Context } from "./context.js";
import { errorDetails, publicMessage } from "./errors.js";

export const t = initTRPC.context<Context>().create({
  // tRPC adds the error's stack trace to responses unless NODE_ENV is "production". The api defaults to production, but
  // development and test set NODE_ENV differently, so this switch is explicit.
  isDev: false,
  // An allow-list, so a field tRPC adds later can't reach clients by being spread in.
  errorFormatter: ({ shape, error }) => ({
    ...shape,
    message: publicMessage(error),
    data: {
      code: shape.data.code,
      httpStatus: shape.data.httpStatus,
      ...(shape.data.path === undefined ? {} : { path: shape.data.path }),
      ...errorDetails(error),
    },
  }),
});

export const router = t.router;
