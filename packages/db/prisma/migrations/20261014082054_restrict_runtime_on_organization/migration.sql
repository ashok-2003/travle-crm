-- Organizations are created and deleted only by the platform console (app_platform), never by the api or worker.
-- UPDATE stays for now; plan 2 decides column-level rights.
REVOKE INSERT, DELETE ON TABLE "organization" FROM app_runtime;
