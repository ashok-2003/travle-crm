// Done and Snooze on a follow-up or task (spec 3.5), as Today and the lead page show them: two quiet buttons named
// for the task. Done goes once; a refusal (a second tab closed it first) shows its own sentence and the task stays
// where it is (Review Focus 5). Snooze opens the snooze dialog.
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Toaster } from "@/components/ui/sonner";
import { messages } from "@/i18n/messages";
import { TaskActions } from "@/tasks/task-actions";
import { fakeApi, newQueryClient, renderWithApi } from "../organization/api";
import { screenIs } from "../organization/render";

const task = { id: "0199e7a0-0000-7000-8000-0000000000f1", title: "Send the Goa options" };

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderActions() {
  screenIs("phone");
  const api = fakeApi();
  renderWithApi(
    <>
      <TaskActions task={task} />
      <Toaster />
    </>,
    newQueryClient(),
  );
  return api;
}

describe("TaskActions", () => {
  it("a refused Done shows its sentence and keeps the task", async () => {
    const api = renderActions();
    const done = screen.getByRole("button", { name: "Done: Send the Goa options" });
    await userEvent.click(done);
    await waitFor(() => {
      expect(api.last().path).toBe("tasks.complete");
    });
    expect(api.last().input).toEqual({ taskId: task.id });
    expect(done).toBeDisabled();
    api.last().refuse(409, "TASK_CLOSED");
    expect(await screen.findByText(messages.errors.reasons.TASK_CLOSED)).toBeVisible();
    await waitFor(() => {
      expect(done).toBeEnabled();
    });
    expect(screen.getByRole("button", { name: "Snooze: Send the Goa options" })).toBeVisible();
  });

  it("marks the task done once and says so", async () => {
    const api = renderActions();
    await userEvent.click(screen.getByRole("button", { name: "Done: Send the Goa options" }));
    await waitFor(() => {
      expect(api.last().path).toBe("tasks.complete");
    });
    api.last().answer({ ...task, kind: "task", dueAt: "2026-10-16T10:30:00.000Z" });
    expect(await screen.findByText(messages.tasks.actions.marked)).toBeVisible();
    expect(api.calls.filter((call) => call.path === "tasks.complete")).toHaveLength(1);
  });

  it("opens the snooze dialog", async () => {
    renderActions();
    await userEvent.click(screen.getByRole("button", { name: "Snooze: Send the Goa options" }));
    expect(await screen.findByRole("dialog", { name: messages.tasks.snooze.title })).toBeVisible();
  });
});
