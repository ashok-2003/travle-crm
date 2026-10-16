// The bell's unread count is asked again every minute, but not after the api refused it (a cancelled or suspended
// organization), which would only refuse again.
import { TRPCClientError } from "@trpc/client";
import { describe, expect, it } from "vitest";
import { countRefreshInterval } from "@/notifications/bell/use-bell";

describe("countRefreshInterval", () => {
  it("asks again every minute while the count is answered, or the network is down", () => {
    expect(countRefreshInterval(null)).toBe(60_000);
    expect(countRefreshInterval(new TypeError("Failed to fetch"))).toBe(60_000);
  });

  it("stops after the api refuses it", () => {
    const refused = new TRPCClientError("Refused", {
      result: {
        error: { message: "Refused", code: -32001, data: { code: "FORBIDDEN", httpStatus: 403, reason: null } },
      },
    });
    expect(countRefreshInterval(refused)).toBe(false);
  });
});
