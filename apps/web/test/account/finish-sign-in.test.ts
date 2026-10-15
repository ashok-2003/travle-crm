// The end of every sign-in empties what an earlier session left on this device, then opens the app. Storage that
// can't be emptied doesn't leave the person signed in but stuck on the sign-in screen.
import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { finishSignIn } from "@/account/finish-sign-in";
import { wipeLocalData } from "@/data/session";

vi.mock("@/data/session", () => ({ wipeLocalData: vi.fn() }));

beforeEach(() => {
  vi.mocked(wipeLocalData).mockReset();
});

describe("finishSignIn", () => {
  it("wipes this device's data, then opens the page", async () => {
    const steps: string[] = [];
    vi.mocked(wipeLocalData).mockImplementationOnce(() => {
      steps.push("wipe");
      return Promise.resolve();
    });
    await finishSignIn(new QueryClient(), "/staff", (path) => {
      steps.push(`open ${path}`);
    });
    expect(steps).toEqual(["wipe", "open /staff"]);
  });

  it("still opens the page when this device's storage refuses the wipe", async () => {
    vi.mocked(wipeLocalData).mockRejectedValueOnce(new DOMException("IndexedDB is blocked", "InvalidStateError"));
    const open = vi.fn();
    await finishSignIn(new QueryClient(), "/staff", open);
    expect(open).toHaveBeenCalledWith("/staff");
  });
});
