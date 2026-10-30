-- Follow-ups the AI works (the owner, 2026-10-30): it adds follow-ups to leads from its chats and, when one comes due,
-- writes to the lead on WhatsApp inside the 24-hour window and notes what it did; the follow-up stays open for the
-- team's call. Additive: two columns with defaults and a new table.

ALTER TABLE "ai_autopilot" ADD COLUMN "follow_up_tasks" BOOLEAN NOT NULL DEFAULT true;

-- A follow-up the AI added from a chat, so the screen can say so.
ALTER TABLE "task" ADD COLUMN "by_ai" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ai_follow_up_touch" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "due_at" TIMESTAMPTZ(6) NOT NULL,
    "conversation_id" UUID,
    "message_id" UUID,
    "outcome" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_follow_up_touch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_follow_up_touch_organization_id_task_id_due_at_key" ON "ai_follow_up_touch"("organization_id", "task_id", "due_at");

-- AddForeignKey
ALTER TABLE "ai_follow_up_touch" ADD CONSTRAINT "ai_follow_up_touch_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ai_follow_up_touch" ADD CONSTRAINT "ai_follow_up_touch_organization_id_task_id_fkey" FOREIGN KEY ("organization_id", "task_id") REFERENCES "task"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "ai_follow_up_touch"
  ADD CONSTRAINT ai_follow_up_touch_outcome_value
    CHECK (outcome IN ('sent', 'window_closed', 'no_chat', 'opted_out', 'off', 'failed'));

-- A record of what happened: the worker claims a due time with a row first (so two runs never both write) and then
-- writes down how it went; the runtime role never deletes one. The organization's purge does.
REVOKE DELETE ON TABLE "ai_follow_up_touch" FROM app_runtime;

-- Organization isolation (see app_enable_org_rls in the init migration).
SELECT app_enable_org_rls('ai_follow_up_touch');
