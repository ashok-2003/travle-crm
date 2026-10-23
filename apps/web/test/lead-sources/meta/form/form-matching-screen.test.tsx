// Matching a lead form's questions (spec 3.4): Facebook's questions in the import's column matcher with their examples and
// guesses; the checklist (a name, and a phone, an email or an Instagram handle); bringing a form in asks about leads from
// before and confirms; the last 30 days wait for the worker's import and open its preview; a brought-in form saves a new match.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { FormMatchingScreen } from "@/lead-sources/meta/form/form-matching-screen";
import { leadImportRoute, metaPageRoute } from "@/lib/routes";
import { renderScreen, inputsTo } from "../../../leads/screen";
import { routerCalls } from "../../../leads/navigation";
import { stubApi } from "../../../support/api-stub";
import { aForm, aFormList, aPageDetail, aQuestionsView, formRowId, pageRowId } from "../records";

vi.mock("next/navigation", () => import("../../../leads/navigation"));

afterEach(() => {
  vi.unstubAllGlobals();
  routerCalls.push.mockClear();
  routerCalls.replace.mockClear();
});

const words = messages.metaLeads.bringIn;
const importId = "0199e7a0-0000-7000-8000-0000000000e9";

function renderForm(mode: "bring-in" | "questions", extra: Parameters<typeof stubApi>[0] = {}) {
  stubApi({
    "metaLeads.formQuestions": { data: aQuestionsView() },
    "metaLeads.get": { data: aPageDetail() },
    "metaLeads.forms": { data: aFormList([aForm({ state: "not_brought_in" })]) },
    "metaLeads.list": { data: { items: [], limit: 5, configured: true, demo: false } },
    ...extra,
  });
  return renderScreen(<FormMatchingScreen pageId={pageRowId} formId={formRowId} mode={mode} />, { width: "wide" });
}

describe("FormMatchingScreen", () => {
  it("shows the questions with their guesses, the checklist ready, and only new leads chosen", async () => {
    renderForm("bring-in");
    expect(await screen.findByRole("heading", { level: 1, name: "Match Rajasthan winter ad" })).toBeVisible();
    expect(screen.getByText(messages.sheets.connect.columns.ready)).toBeVisible();
    expect(screen.getByRole("combobox", { name: "What Full name holds" })).toHaveTextContent("Name");
    expect(screen.getByRole("combobox", { name: "What Phone number holds" })).toHaveTextContent("Phone");
    expect(screen.getByRole("combobox", { name: "What Where do you want to go? holds" })).toHaveTextContent(
      "Destination",
    );
    expect(screen.getByRole("radio", { name: words.earlier.onlyNew })).toBeChecked();
    expect(screen.getByRole("link", { name: "Back to Rajasthan Holidays" })).toHaveAttribute(
      "href",
      metaPageRoute(pageRowId),
    );
  });

  it("turns Bring in off until a name and a phone, email or Instagram are matched, and says what is still needed", async () => {
    renderForm("bring-in", {
      "metaLeads.formQuestions": {
        data: aQuestionsView({
          questions: [
            {
              key: "city",
              type: "city",
              label: "City",
              example: null,
              field: "note",
              guessedBy: "standard",
              isNew: false,
            },
          ],
          hasName: false,
          hasContact: false,
        }),
      },
    });
    expect(await screen.findByText(messages.sheets.connect.columns.needName)).toBeVisible();
    expect(screen.getByText(messages.sheets.connect.columns.needContact)).toBeVisible();
    expect(screen.getByRole("button", { name: words.action })).toBeDisabled();
  });

  it("confirms, then brings the form in with the matches and only the new leads, and goes to the Page", async () => {
    renderForm("bring-in", { "metaLeads.bringIn": { data: null } });
    await userEvent.click(await screen.findByRole("button", { name: words.action }));
    const asking = await screen.findByRole("alertdialog");
    expect(within(asking).getByText(words.confirmDescription)).toBeVisible();
    expect(inputsTo("metaLeads.bringIn")).toEqual([]);
    await userEvent.click(within(asking).getByRole("button", { name: words.confirmAction }));
    await waitFor(() => {
      expect(routerCalls.push).toHaveBeenCalledWith(metaPageRoute(pageRowId));
    });
    expect(inputsTo("metaLeads.bringIn")).toEqual([
      {
        pageId: pageRowId,
        formId: formRowId,
        earlierLeads: "only_new",
        questions: [
          { key: "full_name", field: "name" },
          { key: "phone_number", field: "phone" },
          { key: "where_do_you_want_to_go", field: "destination" },
          { key: "any_other_wish", field: "note" },
        ],
      },
    ]);
  });

  it("sends a question matched differently", async () => {
    renderForm("bring-in", { "metaLeads.bringIn": { data: null } });
    await userEvent.click(await screen.findByRole("combobox", { name: "What Where do you want to go? holds" }));
    await userEvent.click(await screen.findByRole("option", { name: "Note" }));
    await userEvent.click(screen.getByRole("button", { name: words.action }));
    await userEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: words.confirmAction }),
    );
    await waitFor(() => {
      expect(inputsTo("metaLeads.bringIn")).toHaveLength(1);
    });
    expect(inputsTo("metaLeads.bringIn")[0]).toMatchObject({
      questions: expect.arrayContaining([{ key: "where_do_you_want_to_go", field: "note" }]) as unknown,
    });
  });

  it("asks for the last 30 days, waits for the form's import and opens its preview", async () => {
    renderForm("bring-in", {
      "metaLeads.bringIn": { data: null },
      "metaLeads.forms": { data: aFormList([aForm({ state: "running", earlierImportId: importId })]) },
    });
    await userEvent.click(await screen.findByRole("radio", { name: words.earlier.last30 }));
    await userEvent.click(screen.getByRole("button", { name: words.action }));
    await userEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: words.confirmAction }),
    );
    expect(await screen.findByText(words.reading30.body)).toBeVisible();
    await waitFor(() => {
      expect(routerCalls.replace).toHaveBeenCalledWith(leadImportRoute(importId));
    });
    expect(inputsTo("metaLeads.bringIn")[0]).toMatchObject({ earlierLeads: "last_30_days" });
  });

  it("shows the refusal inside the confirmation and keeps it open", async () => {
    renderForm("bring-in", { "metaLeads.bringIn": { status: 409, reason: "META_FORM_INCOMPLETE" } });
    await userEvent.click(await screen.findByRole("button", { name: words.action }));
    const asking = await screen.findByRole("alertdialog");
    await userEvent.click(within(asking).getByRole("button", { name: words.confirmAction }));
    expect(await within(asking).findByText(messages.errors.reasons.META_FORM_INCOMPLETE)).toBeVisible();
  });

  it("marks a question the form gained, and saves a new match for a form already brought in", async () => {
    renderForm("questions", {
      "metaLeads.formQuestions": {
        data: aQuestionsView({
          questions: [
            {
              key: "full_name",
              type: "full_name",
              label: "Full name",
              example: "Meena Iyer",
              field: "name",
              guessedBy: null,
              isNew: false,
            },
            {
              key: "phone_number",
              type: "phone",
              label: "Phone number",
              example: "+91 98765 43210",
              field: "phone",
              guessedBy: null,
              isNew: false,
            },
            {
              key: "budget",
              type: "custom",
              label: "Budget",
              example: null,
              field: "note",
              guessedBy: null,
              isNew: true,
            },
          ],
        }),
      },
      "metaLeads.saveQuestions": { data: null },
    });
    expect(await screen.findByRole("heading", { level: 1, name: "Questions of Rajasthan winter ad" })).toBeVisible();
    expect(screen.getByText(`Budget · ${words.newQuestion}`)).toBeVisible();
    expect(screen.getByText("Meena Iyer")).toBeVisible();
    // Nothing about earlier leads: the form is already running.
    expect(screen.queryByRole("radio")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: words.save }));
    await waitFor(() => {
      expect(routerCalls.push).toHaveBeenCalledWith(metaPageRoute(pageRowId));
    });
    expect(inputsTo("metaLeads.saveQuestions")).toEqual([
      {
        pageId: pageRowId,
        formId: formRowId,
        questions: [
          { key: "full_name", field: "name" },
          { key: "phone_number", field: "phone" },
          { key: "budget", field: "note" },
        ],
      },
    ]);
  });

  it("says the form's questions couldn't be read, with Try again", async () => {
    renderForm("bring-in", { "metaLeads.formQuestions": { status: 502, reason: "META_UNAVAILABLE" } });
    expect(await screen.findByText(messages.errors.reasons.META_UNAVAILABLE)).toBeVisible();
    expect(screen.getByRole("button", { name: messages.common.tryAgain })).toBeVisible();
  });
});
