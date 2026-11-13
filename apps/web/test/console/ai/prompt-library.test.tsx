// The console's AI prompts page, a super admin's alone: what each of the lite agent's two model calls is given, then
// every fixed piece with its version and text. Support is told it's a super admin's, and nothing is asked of the api.
import type { AiPromptLibrary } from "@travel-crm/contracts/platform";
import { screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PromptLibraryScreen } from "@/console/ai/prompt-library-screen";
import { messages } from "@/i18n/messages";
import { formatCalendarDay } from "@/lib/format";
import { stubApi } from "../../support/api-stub";
import { platformStaff } from "../../support/platform-staff";
import { inputsTo, renderConsole } from "../../support/render-console";

const words = messages.consoleAi;

const library: AiPromptLibrary = {
  pieces: [
    { name: "understand.instructions", version: 1, changedOn: "2026-11-12", text: "READ_THE_CHAT_WORDS" },
    { name: "fixed.texts", version: 2, changedOn: "2026-11-13", text: "greeting (english): Hello" },
  ],
  calls: [
    {
      name: "understand",
      system: ["understand.instructions"],
      blocks: [
        { title: "Agency", purpose: "Who the customer is writing to.", budget: 200 },
        { title: "Lead card", purpose: "What the CRM already knows.", budget: 500 },
      ],
      answer: "understand_form",
      lookups: ["find_packages", "price"],
    },
    {
      name: "write",
      system: ["write.instructions"],
      blocks: [{ title: "You", purpose: "Who you are.", budget: 250 }],
      answer: "write_move",
      lookups: [],
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PromptLibraryScreen", () => {
  it("shows each call's pieces, blocks and lookups, then every piece's text", async () => {
    stubApi({ "platform.aiTransparency.prompts": { data: library } });
    renderConsole(<PromptLibraryScreen />);
    expect(await screen.findByRole("heading", { name: words.prompts.call.understand })).toBeVisible();
    expect(screen.getByRole("heading", { name: words.prompts.call.write })).toBeVisible();
    const row = within((await screen.findByText("Lead card")).closest("tr") ?? document.body);
    expect(row.getByText("What the CRM already knows.")).toBeVisible();
    expect(row.getByText("500")).toBeVisible();
    expect(screen.getByText(/find_packages/)).toBeVisible();
    expect(screen.getByText(words.prompts.noLookups)).toBeVisible();
    expect(screen.getByRole("heading", { name: "understand.instructions" })).toBeVisible();
    expect(screen.getByText(`Version 1, changed ${formatCalendarDay("2026-11-12")}`)).toBeVisible();
    expect(screen.getByLabelText("understand.instructions")).toHaveTextContent("READ_THE_CHAT_WORDS");
    expect(screen.getAllByText(words.prompts.fixedTexts)).toHaveLength(1);
    expect(screen.getByText("understand_form")).toBeVisible();
    expect(screen.getByText("write_move")).toBeVisible();
    expect(screen.getByText("You")).toBeVisible();
    const [understandSystem, writeSystem] = screen.getAllByText(/System message, the same every turn/);
    expect(understandSystem).toHaveTextContent("understand.instructions");
    expect(writeSystem).toHaveTextContent("write.instructions");
  });

  it("says why the prompts didn't load, with a way to try again", async () => {
    stubApi({ "platform.aiTransparency.prompts": { status: 403 } });
    renderConsole(<PromptLibraryScreen />);
    expect(await screen.findByText(words.prompts.loadFailed)).toBeVisible();
    expect(screen.getByRole("button", { name: messages.common.tryAgain })).toBeVisible();
  });

  it("tells support the page is a super admin's, and asks nothing", async () => {
    stubApi({ "platform.aiTransparency.prompts": { data: library } });
    renderConsole(<PromptLibraryScreen />, platformStaff("support"));
    expect(await screen.findByText(words.superAdminsOnly)).toBeVisible();
    expect(inputsTo("aiTransparency.prompts")).toEqual([]);
  });
});
