// Redirects only ever lead to a page of this app: a ?next= naming another site, or the api, is ignored.
import { describe, expect, it } from "vitest";
import { isAppPath, isConsolePath, isPublicRoute, pendingStepRoute, routes, signInRoute } from "@/lib/routes";

/** Where the browser would land if it followed path from a page of the app, as location.assign does. */
const landsOn = (path: string) => new URL(path, "https://app.example.in/sign-in").origin;

describe("routes", () => {
  it("brings the person back to an app path after signing in, filters included", () => {
    expect(signInRoute("/staff")).toBe("/sign-in?next=%2Fstaff");
    expect(signInRoute("/staff?role=sales#top")).toBe("/sign-in?next=%2Fstaff%3Frole%3Dsales%23top");
    expect(signInRoute()).toBe("/sign-in");
  });

  it("knows the platform console's pages, with or without a query", () => {
    for (const path of ["/console", "/console/plans", "/console/organizations/1?onboarded=1", "/console?x=1"]) {
      expect(isConsolePath(path), path).toBe(true);
    }
    for (const path of ["/", "/consoles", "/staff?next=/console", "/settings/console"]) {
      expect(isConsolePath(path), path).toBe(false);
    }
  });

  it("accepts this app's own pages", () => {
    for (const path of ["/", "/roles", "/staff?role=sales", "/roles/sales#permissions", "/sign-in/two-factor"]) {
      expect(isAppPath(path), path).toBe(true);
    }
  });

  it("refuses paths that lead to another site", () => {
    const offSite = [
      "//evil.example",
      "/\\evil.example",
      "https://evil.example",
      "javascript:alert(1)",
      "staff",
      "",
      // The URL parser drops tabs and newlines anywhere, so each of these becomes "//evil.example".
      "/\t/evil.example",
      "/\n/evil.example",
      "/\r/evil.example",
      "/\t\\evil.example",
      "\t//evil.example",
      "/\u0000/evil.example",
      " /staff",
      "/staff\n",
      "/st\taff",
      // Encoded slashes and backslashes, as a raw value and inside a path.
      "%2F%2Fevil.example",
      "/%2F%2Fevil.example",
      "/%5Cevil.example",
      "/%5C%5Cevil.example",
    ];
    for (const path of offSite) {
      expect(isAppPath(path), JSON.stringify(path)).toBe(false);
      expect(signInRoute(path)).toBe("/sign-in");
    }
    // The tab cases are real: a browser following them would leave the app.
    expect(landsOn("/\t/evil.example")).toBe("https://evil.example");
  });

  it("refuses the api, whatever its case or encoding", () => {
    for (const path of ["/api", "/api/auth/sign-out", "/API/trpc/me.get", "/Api/x", "/%61pi/trpc/me.get"]) {
      expect(isAppPath(path), path).toBe(false);
    }
  });

  it("knows the signed-out screens and where each pending step is taken", () => {
    expect(isPublicRoute(routes.signIn)).toBe(true);
    expect(isPublicRoute(routes.resetPassword)).toBe(true);
    expect(isPublicRoute("/offline")).toBe(true);
    expect(isPublicRoute(routes.staff)).toBe(false);
    expect(pendingStepRoute("CHANGE_PASSWORD")).toBe(routes.changePassword);
    expect(pendingStepRoute("SET_UP_TWO_FACTOR")).toBe(routes.twoFactorSetup);
  });

  it("brings the person back from a pending step to an app path, as from signing in", () => {
    expect(pendingStepRoute("CHANGE_PASSWORD", "/console/plans")).toBe("/change-password?next=%2Fconsole%2Fplans");
    expect(pendingStepRoute("SET_UP_TWO_FACTOR", routes.console)).toBe("/two-factor-setup?next=%2Fconsole");
    expect(pendingStepRoute("SET_UP_TWO_FACTOR", "//evil.example")).toBe(routes.twoFactorSetup);
  });
});
