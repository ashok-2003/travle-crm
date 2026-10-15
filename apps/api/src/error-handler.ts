// What the api answers, and logs, for an error no route handled (spec 9.1, 9.7). Hono's own handler would print the
// whole error, whose message can quote a person's data: here the process log gets one line of names and codes, and
// the caller gets an answer that says nothing about it. That is the share-link page under /p, which people open in a
// browser, and plan 2's internal-error JSON everywhere else.
import { describeError } from "@travel-crm/integrations/jobs";
import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ProcessLog } from "./process-log.js";
import { linkFailedPage } from "./share-link-route.js";

/** The part of a path a log line shows: /p's token is a secret, so only the first segment (two under /api). */
function areaOf(path: string): string {
  const [first = "", second = ""] = path.split("/").filter((segment) => segment !== "");
  return first === "api" ? `/api/${second}` : `/${first}`;
}

export function apiErrorHandler(log: ProcessLog): ErrorHandler {
  return (error, c) => {
    // A deliberate answer (Hono's HTTPException), not a fault.
    if (error instanceof HTTPException) {
      const response = error.getResponse();
      return c.newResponse(response.body, response);
    }
    const area = areaOf(c.req.path);
    log(`${c.req.method} ${area} failed: ${describeError(error)}`);
    if (area === "/p") return linkFailedPage();
    return c.json({ code: "INTERNAL_SERVER_ERROR", message: "Something went wrong" }, 500);
  };
}
