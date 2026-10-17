// What a tab keeps between its screens (sessionStorage): read back as it was kept, removed by a blank, all forgotten at
// once by a wipe, and storage that refuses (a private window, a full quota) never breaks a screen.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { forgetTabValues, keepTabValue, readTabValue } from "@/lib/tab-storage";

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("tab storage", () => {
  it("reads back what it kept, and a blank removes it", () => {
    expect(readTabValue("leads.search")).toBeNull();
    keepTabValue("leads.search", "Rahul");
    expect(readTabValue("leads.search")).toBe("Rahul");
    keepTabValue("leads.search", "");
    expect(readTabValue("leads.search")).toBeNull();
  });

  it("forgets everything it kept, and only that", () => {
    window.sessionStorage.setItem("someone-else", "kept");
    keepTabValue("leads.search", "98765");
    keepTabValue("another", "x");
    forgetTabValues();
    expect(readTabValue("leads.search")).toBeNull();
    expect(readTabValue("another")).toBeNull();
    expect(window.sessionStorage.getItem("someone-else")).toBe("kept");
  });

  it("works on without storage that refuses", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    expect(() => {
      keepTabValue("leads.search", "Rahul");
    }).not.toThrow();
    expect(readTabValue("leads.search")).toBeNull();
    expect(() => {
      forgetTabValues();
    }).not.toThrow();
  });
});
