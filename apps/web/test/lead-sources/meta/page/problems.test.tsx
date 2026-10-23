// The leads that couldn't be added (spec 3.3): each with its name, its reasons in words, the platform and the day it was
// first seen; Check again reads the lead once more and says what came of it; Hide takes the line away; fifty at a time.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { Problems } from "@/lead-sources/meta/page/problems";
import { renderScreen, inputsTo } from "../../../leads/screen";
import { stubApi } from "../../../support/api-stub";
import { aProblem, aProblemList, pageRowId } from "../records";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-23T08:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const words = messages.metaLeads.problems;
const leadRowId = "0199e7a0-0000-7000-8000-0000000000d1";

describe("Problems", () => {
  it("lists each lead with its reasons, platform and first-seen day, on a computer", async () => {
    stubApi({
      "metaLeads.problems": {
        data: aProblemList([
          aProblem(),
          aProblem({ id: "b", exampleName: null, reasons: ["no_name", "no_contact"], platform: null }),
        ]),
      },
    });
    renderScreen(<Problems pageId={pageRowId} />, { width: "wide" });
    const table = await screen.findByRole("table", { name: words.listLabel });
    const [first, second] = within(table).getAllByRole("row").slice(1);
    if (first === undefined || second === undefined) throw new Error("rows missing");
    expect(first).toHaveTextContent("Meena Iyer");
    expect(first).toHaveTextContent(words.reasons.phone_invalid);
    expect(first).toHaveTextContent("22 Oct");
    expect(second).toHaveTextContent(words.noName);
    expect(second).toHaveTextContent(`${words.reasons.no_name}. ${words.reasons.no_contact}`);
  });

  it("lists them on a phone with the platform", async () => {
    stubApi({ "metaLeads.problems": { data: aProblemList() } });
    renderScreen(<Problems pageId={pageRowId} />, { width: "phone" });
    const list = await screen.findByRole("list", { name: words.listLabel });
    expect(within(list).getByText(/Instagram · first seen 22 Oct/)).toBeVisible();
  });

  it("checks a lead again and says it was added", async () => {
    stubApi({
      "metaLeads.problems": { data: aProblemList() },
      "metaLeads.retryLead": { data: { result: "added" } },
    });
    renderScreen(<Problems pageId={pageRowId} />, { width: "wide" });
    await userEvent.click(await screen.findByRole("button", { name: "Check again for Meena Iyer" }));
    expect(await screen.findByText(words.checkedAdded)).toBeVisible();
    expect(inputsTo("metaLeads.retryLead")).toEqual([{ pageId: pageRowId, leadRowId }]);
  });

  it("says a lead still can't be added", async () => {
    stubApi({
      "metaLeads.problems": { data: aProblemList() },
      "metaLeads.retryLead": { data: { result: "not_added" } },
    });
    renderScreen(<Problems pageId={pageRowId} />, { width: "wide" });
    await userEvent.click(await screen.findByRole("button", { name: "Check again for Meena Iyer" }));
    expect(await screen.findByText(words.checkedNotAdded)).toBeVisible();
  });

  it("hides a lead", async () => {
    stubApi({ "metaLeads.problems": { data: aProblemList() }, "metaLeads.hideProblem": { data: null } });
    renderScreen(<Problems pageId={pageRowId} />, { width: "wide" });
    await userEvent.click(await screen.findByRole("button", { name: "Hide Meena Iyer" }));
    await waitFor(() => {
      expect(inputsTo("metaLeads.hideProblem")).toEqual([{ pageId: pageRowId, leadRowId }]);
    });
  });

  it("asks for the next page by the cursor", async () => {
    stubApi({ "metaLeads.problems": { data: aProblemList([aProblem()], "cursor-1") } });
    renderScreen(<Problems pageId={pageRowId} />, { width: "wide" });
    await userEvent.click(await screen.findByRole("button", { name: words.more }));
    await waitFor(() => {
      expect(inputsTo("metaLeads.problems")).toEqual([{ pageId: pageRowId }, { pageId: pageRowId, after: "cursor-1" }]);
    });
  });

  it("says the leads didn't load, with Try again", async () => {
    stubApi({ "metaLeads.problems": { status: 500 } });
    renderScreen(<Problems pageId={pageRowId} />, { width: "wide" });
    expect(await screen.findByText(words.loadFailed)).toBeVisible();
  });
});
