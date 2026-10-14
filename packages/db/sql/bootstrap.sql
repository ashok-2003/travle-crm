-- Creates the three database roles the app uses. Run once per database, as a superuser.
-- Local Docker and the test suite run this file as-is. These passwords are for local use only:
-- in a hosted database, create the same roles with strong passwords and the same grants.
--
-- app_migrator  owns the tables and runs migrations (CREATEDB lets `prisma migrate dev` make a shadow database)
-- app_runtime   used by the api and worker; row-level security always applies to it
-- app_platform  used only by the platform console; the platform_access policy lets it see every organization
CREATE ROLE app_migrator LOGIN PASSWORD 'migrator' NOBYPASSRLS CREATEDB;
CREATE ROLE app_runtime  LOGIN PASSWORD 'runtime'  NOBYPASSRLS;
CREATE ROLE app_platform LOGIN PASSWORD 'platform' NOBYPASSRLS;

-- The migrator owns the database, and so (Postgres 15+) the public schema. Nobody else can create tables in it.
DO $$ BEGIN EXECUTE format('ALTER DATABASE %I OWNER TO app_migrator', current_database()); END $$;

GRANT USAGE ON SCHEMA public TO app_runtime, app_platform;
ALTER DEFAULT PRIVILEGES FOR ROLE app_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_runtime, app_platform;
ALTER DEFAULT PRIVILEGES FOR ROLE app_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_runtime, app_platform;
