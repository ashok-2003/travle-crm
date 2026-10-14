-- Soft-deleted tables keep their rows: only the platform role's purge may remove them, so app_runtime loses DELETE.
REVOKE DELETE ON TABLE "role", "member" FROM app_runtime;
