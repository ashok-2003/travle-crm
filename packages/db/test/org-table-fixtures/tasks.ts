// Isolation fixtures for the tasks module: follow-ups and tasks, linked to a record or standing alone. Tasks end done
// or cancelled, never deleted by the runtime role (R9).
import type { OrgTableFixtures } from "../org-table-fixture.js";

export const fixtures: OrgTableFixtures = {
  task: {
    create: (tx) =>
      tx.task.create({
        data: {
          kind: "task",
          title: "Isolation task",
          dueAt: new Date("2026-10-17T09:00:00Z"),
          firstDueAt: new Date("2026-10-17T09:00:00Z"),
        },
      }),
    undeletable: true,
  },
};
