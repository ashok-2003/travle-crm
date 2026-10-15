// Redirects only ever lead to a page of this app: a ?next= naming another site is ignored.
import { describe, expect, it } from "vitest";
import { isAppPath, isPublicRoute, pendingStepRoute, routes, signInRoute } from "@/lib/routes";

describe("routes", () => {
  it("brings the person back to an app path after signing in", () => {
    expect(signInRoute("/staff")).toBe("/sign-in?next=%2Fstaff");
    expect(signInRoute()).toBe("/sign-in");
  });

  it("refuses paths that lead to another site", () => {
    expect(isAppPath("/roles")).toBe(true);
    for (const path of ["//evil.example", "https://evil.example", "/\\evil.example", "staff"]) {
      expect(isAppPath(path), path).toBe(false);
      expect(signInRoute(path)).toBe("/sign-in");
    }
  });

  it("knows the signed-out screens and where each pending step is taken", () => {
    expect(isPublicRoute(routes.signIn)).toBe(true);
    expect(isPublicRoute(routes.resetPassword)).toBe(true);
    expect(isPublicRoute(routes.staff)).toBe(false);
    expect(pendingStepRoute("CHANGE_PASSWORD")).toBe(routes.changePassword);
    expect(pendingStepRoute("SET_UP_TWO_FACTOR")).toBe(routes.twoFactorSetup);
  });
});
