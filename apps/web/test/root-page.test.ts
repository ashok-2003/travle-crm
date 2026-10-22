// "/" sends everyone to the dashboard, the signed-in home (installed phones that started at "/" still land there).
import { describe, expect, it, vi } from "vitest";

const redirect = vi.hoisted(() =>
  vi.fn((path: string) => {
    throw new Error(`redirected to ${path}`);
  }),
);
vi.mock("next/navigation", () => ({ redirect }));

import RootPage from "@/app/page";

describe("the root page", () => {
  it("redirects to the dashboard", () => {
    expect(() => RootPage()).toThrow("redirected to /dashboard");
    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });
});
