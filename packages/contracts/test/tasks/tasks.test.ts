// Tasks as the api takes them (spec 3.5): a title and a due time on the agency's clock, and the three snooze choices.
import { describe, expect, it } from "vitest";
import { addTaskInput, snoozeTaskInput, taskTitle } from "../../src/tasks/index.js";

const taskId = "0199e7a0-0000-7000-8000-0000000000f1";

describe("task inputs", () => {
  it("accepts the three snooze choices and refuses a time not HH:MM", () => {
    for (const until of [
      { choice: "one-hour" },
      { choice: "tomorrow-morning" },
      { choice: "at", due: { on: "2026-10-18", at: "09:30" } },
    ]) {
      expect(snoozeTaskInput.safeParse({ taskId, until }).success, JSON.stringify(until)).toBe(true);
    }
    for (const at of ["9:30", "24:00", "09:60", "09:30:00", "9.30 am"]) {
      const until = { choice: "at", due: { on: "2026-10-18", at } };
      expect(snoozeTaskInput.safeParse({ taskId, until }).success, at).toBe(false);
    }
    expect(snoozeTaskInput.safeParse({ taskId, until: { choice: "next-week" } }).success).toBe(false);
    expect(snoozeTaskInput.safeParse({ taskId, until: { choice: "one-hour", due: null } }).success).toBe(false);
    expect(
      snoozeTaskInput.safeParse({ taskId, until: { choice: "at", due: { on: "2026-02-30", at: "09:30" } } }).success,
    ).toBe(false);
  });

  it("takes a short title and an assignee or nobody, and nothing else", () => {
    const due = { on: "2026-10-18", at: "16:00" };
    expect(addTaskInput.parse({ title: "  Call the hotel ", due, assigneeUserId: null }).title).toBe("Call the hotel");
    expect(addTaskInput.safeParse({ title: "", due, assigneeUserId: null }).success).toBe(false);
    expect(taskTitle.safeParse("x".repeat(201)).success).toBe(false);
    expect(addTaskInput.safeParse({ title: "Call", due, assigneeUserId: null, extra: 1 }).success).toBe(false);
  });
});
