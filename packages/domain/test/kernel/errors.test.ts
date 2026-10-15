// DomainError's messages are ours, so a failed job's stored error keeps them, masked. The kernel marks it with the
// registry key that @travel-crm/integrations/jobs reads, written out in both places (the kernel stays browser-safe and
// imports nothing from integrations), so this checks the two agree.
import { OWN_MESSAGE_KEY as integrationsKey, sanitizeJobError } from "@travel-crm/integrations/jobs";
import { describe, expect, it } from "vitest";
import { OWN_MESSAGE_KEY as kernelKey } from "../../src/kernel/errors.js";
import { DomainError } from "../../src/kernel/index.js";

describe("DomainError in a failed job", () => {
  it("is marked with the same key the sanitiser reads", () => {
    expect(kernelKey).toBe(integrationsKey);
  });

  it("keeps its message, masked, where anyone else's error keeps only its name", () => {
    const refused = new DomainError("VALIDATION", "NO_QUOTE", "No quote for jane.doe@example.com");
    expect(sanitizeJobError(refused).message).toBe("DomainError: No quote for [email]");
  });
});
