// The console's jobs run in platform transactions, and pg-boss keeps a failed job's error message only when our own
// code wrote it. @travel-crm/db marks its fixed-text platform errors with the registry key integrations reads,
// without importing integrations; this checks the two agree, so those messages survive.
import { OrganizationStepOpenError, PlatformTransactionAbortedError } from "@travel-crm/db/platform";
import { sanitizeJobError } from "@travel-crm/integrations/jobs";
import { describe, expect, it } from "vitest";

describe("the platform transaction errors in a failed job", () => {
  it("keep their own messages, and nothing of the error that caused them", () => {
    const aborted = sanitizeJobError(
      new PlatformTransactionAbortedError({ cause: new Error("duplicate key for jane.doe@example.com") }),
    );
    expect(aborted.message).toMatch(/^PlatformTransactionAbortedError: A step into an organization failed/);
    expect(aborted.message).not.toMatch(/jane/);
    expect(sanitizeJobError(new OrganizationStepOpenError()).message).toMatch(
      /^OrganizationStepOpenError: This platform transaction is in an organization/,
    );
  });
});
