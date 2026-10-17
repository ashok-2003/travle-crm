// Snoozing a follow-up or task (spec 3.5): one hour, tomorrow morning at 9:00, or a chosen day and time, sent as the
// api takes them; the dialog holds while the request is out (rule 7) and closes once it is done.
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { SnoozeDialog } from "@/tasks/snooze-dialog";
import { fakeApi, newQueryClient, renderWithApi } from "../organization/api";
import { screenIs } from "../organization/render";

const taskId = "0199e7a0-0000-7000-8000-0000000000f1";
const words = messages.tasks.snooze;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-16T05:30:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function renderDialog() {
  screenIs("wide");
  const api = fakeApi();
  const onOpenChange = vi.fn();
  renderWithApi(
    <SnoozeDialog taskId={taskId} open onOpenChange={onOpenChange} returnFocusTo={{ current: null }} />,
    newQueryClient(),
  );
  return { api, onOpenChange };
}

async function snoozeWith(choice: string) {
  await userEvent.click(screen.getByRole("radio", { name: choice }));
  await userEvent.click(screen.getByRole("button", { name: words.submit }));
}

describe("SnoozeDialog", () => {
  it("sends one-hour, tomorrow-morning and { choice: 'at', due: { on, at } }, and holds while pending", async () => {
    const { api, onOpenChange } = renderDialog();
    await snoozeWith(words.oneHour);
    await waitFor(() => {
      expect(api.last().path).toBe("tasks.snooze");
    });
    expect(api.last().input).toEqual({ taskId, until: { choice: "one-hour" } });
    expect(screen.getByRole("button", { name: messages.common.cancel })).toBeDisabled();
    expect(onOpenChange).not.toHaveBeenCalled();
    api.last().answer({});
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    await snoozeWith(words.tomorrowMorning);
    await waitFor(() => {
      expect(api.calls).toHaveLength(2);
    });
    expect(api.last().input).toEqual({ taskId, until: { choice: "tomorrow-morning" } });
    api.last().answer({});

    await userEvent.click(screen.getByRole("radio", { name: words.choose }));
    const day = screen.getByRole("textbox", { name: messages.forms.due.day });
    await userEvent.clear(day);
    await userEvent.type(day, "18/10/2026");
    fireEvent.change(screen.getByLabelText(messages.forms.due.time), { target: { value: "16:30" } });
    await userEvent.click(screen.getByRole("button", { name: words.submit }));
    await waitFor(() => {
      expect(api.calls).toHaveLength(3);
    });
    expect(api.last().input).toEqual({ taskId, until: { choice: "at", due: { on: "2026-10-18", at: "16:30" } } });
  });

  it("names a missing time instead of sending", async () => {
    const { api } = renderDialog();
    await userEvent.click(screen.getByRole("radio", { name: words.choose }));
    await userEvent.click(screen.getByRole("button", { name: words.submit }));
    expect(await screen.findByText(words.problems.time)).toBeVisible();
    expect(api.calls).toEqual([]);
  });
});
