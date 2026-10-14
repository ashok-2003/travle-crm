// Errors reach the client with the right status and a code and reason to translate, and internal details stay hidden.
import { TRPCError } from "@trpc/server";
import { DomainError } from "@travel-crm/domain/kernel";
import { describe, expect, it } from "vitest";
import { errorDetails, publicMessage, toTrpcError } from "../src/errors.js";

describe("api errors", () => {
  it("gives each domain error code its HTTP status", () => {
    const statuses = {
      NOT_FOUND: "NOT_FOUND",
      FORBIDDEN: "FORBIDDEN",
      CONFLICT: "CONFLICT",
      LIMIT_REACHED: "FORBIDDEN",
      FEATURE_LOCKED: "FORBIDDEN",
      VALIDATION: "BAD_REQUEST",
    } as const;
    for (const [domainCode, trpcCode] of Object.entries(statuses)) {
      const error = toTrpcError(new DomainError(domainCode as keyof typeof statuses, "SOME_REASON", "message"));
      expect(error.code).toBe(trpcCode);
    }
  });

  it("passes the domain code and reason to the client", () => {
    const error = toTrpcError(new DomainError("CONFLICT", "ROLE_IN_USE", "Move the staff first"));
    expect(errorDetails(error)).toEqual({ domainCode: "CONFLICT", reason: "ROLE_IN_USE" });
    expect(publicMessage(error)).toBe("Move the staff first");
  });

  it("hides the message of unexpected errors", () => {
    const error = new TRPCError({ code: "INTERNAL_SERVER_ERROR", cause: new Error('relation "user" does not exist') });
    expect(publicMessage(error)).toBe("Something went wrong");
    expect(errorDetails(error)).toEqual({ domainCode: null, reason: null });
  });
});
