// The api and the worker together on real Postgres, pg-boss and MinIO, with email and push in memory: what
// worker.test.ts runs its flow on. Starting it records each thing as it starts, so a set-up that fails half-way is
// stopped without hiding its error.
import { startWorker, type Worker } from "@travel-crm/domain/jobs";
import { createRateLimiter } from "@travel-crm/domain/rate-limits";
import { createMemoryEmailSender, type MemoryEmailSender } from "@travel-crm/integrations/email";
import { createPgBossJobs, type PgBossJobs } from "@travel-crm/integrations/jobs";
import { createMemoryPushSender } from "@travel-crm/integrations/push";
import { createS3Storage } from "@travel-crm/integrations/storage";
import { inject } from "vitest";
import { workerProblemLine } from "../../src/process-log.js";
import { workerJobs, type WorkerJobs } from "../../src/worker-jobs.js";
import { startMinio, type TestMinio } from "./minio.js";
import { createTestAgency, createTestServer, type TestAgency, type TestServer } from "./test-server.js";
import type { CountingWebhookProvider } from "./webhook-provider.js";

/** What has started so far. */
export interface Running {
  minio?: TestMinio;
  jobs?: PgBossJobs;
  server?: TestServer;
  worker?: Worker;
}

export interface WorkerFlow {
  server: TestServer;
  agency: TestAgency;
  jobs: PgBossJobs;
  work: WorkerJobs;
  email: MemoryEmailSender;
  /** Whether pg-boss has completed the job with this id. */
  completed(jobId: string): Promise<boolean>;
}

/** Starts the flow; everything the worker and pg-boss report goes to `reported`. */
export async function startWorkerFlow(
  running: Running,
  reported: string[],
  webhooks: CountingWebhookProvider,
): Promise<WorkerFlow> {
  const minio = await startMinio();
  running.minio = minio;
  const jobs = createPgBossJobs({
    connectionString: inject("dbUrls").runtime,
    maxConnections: 3,
    pollingIntervalSeconds: 0.5,
    retryPolicy: { retryLimit: 1, retryDelaySeconds: 1, retryDelayMaxSeconds: 1 },
    log: (line) => reported.push(`pg-boss: ${line}`),
  });
  await jobs.start();
  running.jobs = jobs;
  const server = createTestServer(
    {},
    { storage: createS3Storage(minio.settings), queue: jobs, webhookProviders: [webhooks.provider] },
  );
  running.server = server;
  const agency = await createTestAgency(server);
  // issueDocument reads the organization's zone; Reply-To is its contact address.
  await server.platform.organization.update({
    where: { id: agency.organizationId },
    data: { contactEmail: "hello@sharma.example", timeZone: "Asia/Kolkata" },
  });
  const email = createMemoryEmailSender();
  const work = workerJobs({
    db: server.db,
    identity: server.identity,
    files: server.files,
    email,
    push: createMemoryPushSender(),
    appUrl: "https://app.example.in",
    webhookProviders: [webhooks.provider],
    rateLimiter: createRateLimiter(server.db, { keySecret: "worker-flow-test-rate-limit-secret-of-32-bytes" }),
    log: (line) => reported.push(line),
  });
  running.worker = await startWorker({
    db: server.db,
    runner: jobs,
    queue: jobs,
    ...work,
    // Only this flow's organization: other test files share the database.
    relay: { intervalMs: 100, organizationIds: [agency.organizationId] },
    onError: (problem) => reported.push(`relay: ${workerProblemLine(problem)}`),
  });
  const completed = async (jobId: string) => {
    const [job] = await server.db.withoutOrg(
      (tx) => tx.$queryRaw<{ state: string }[]>`SELECT state FROM pgboss.job WHERE id = ${jobId}::uuid`,
    );
    return job?.state === "completed";
  };
  return { server, agency, jobs, work, email, completed };
}

/** Stops what started, pg-boss before the server's pools close (its running jobs use them). */
export async function stopWorkerFlow(running: Running): Promise<void> {
  await running.worker?.stop();
  await running.jobs?.stop();
  await running.server?.close();
  await running.minio?.stop();
}
