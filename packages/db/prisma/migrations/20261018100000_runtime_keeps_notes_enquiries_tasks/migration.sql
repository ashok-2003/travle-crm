-- Nothing in the api or the worker deletes a note, a repeat enquiry or a task: tasks end done or cancelled (R9), and
-- only the platform role's customer erasure and purge remove notes and repeat enquiries. Without a DELETE grant, a bug
-- or an injected statement in the runtime role can't remove them either, as the timeline already can't (R7).
REVOKE DELETE ON TABLE "lead_note", "lead_enquiry", "task" FROM app_runtime;
