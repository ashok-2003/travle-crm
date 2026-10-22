// The logo on the public form: a logo that cannot be shown (sensitive, not ready) is "no logo", not a failed form.
import { DomainError } from "@travel-crm/domain/kernel";
import { describe, expect, it } from "vitest";
import { logoLinkOf } from "../src/public-form.js";

const organizationId = "0199e7a0-0000-7000-8000-0000000000e1";
const attachment = [{ id: "0199e7a0-0000-7000-8000-0000000000e2" }];

const filesWith = (link: () => Promise<{ url: string }>, listed: unknown[] = attachment) =>
  ({ list: () => Promise.resolve(listed), systemDownloadLink: link }) as unknown as Parameters<typeof logoLinkOf>[0];

describe("logoLinkOf", () => {
  it("is the newest logo's link", async () => {
    expect(
      await logoLinkOf(
        filesWith(() => Promise.resolve({ url: "https://files.example/logo" })),
        organizationId,
      ),
    ).toBe("https://files.example/logo");
  });

  it("is null when there is no logo", async () => {
    expect(
      await logoLinkOf(
        filesWith(() => Promise.reject(new Error("unused")), []),
        organizationId,
      ),
    ).toBeNull();
  });

  it("is null for a sensitive logo and for one that is not ready", async () => {
    for (const reason of ["FILE_SENSITIVE", "NOT_FOUND", "FILE_NOT_READY"]) {
      const refused = () => Promise.reject(new DomainError("FORBIDDEN", reason, "Not shown"));
      expect(await logoLinkOf(filesWith(refused), organizationId), reason).toBeNull();
    }
  });

  it("still fails on an error that is not a refusal", async () => {
    await expect(
      logoLinkOf(
        filesWith(() => Promise.reject(new Error("storage down"))),
        organizationId,
      ),
    ).rejects.toThrow("storage down");
  });
});
