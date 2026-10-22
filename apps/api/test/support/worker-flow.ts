// The api and the worker together on real Postgres, pg-boss and MinIO, with email and push in memory: what
// worker.test.ts runs its flow on. Starting it records each thing as it starts, so a set-up that fails half-way is
// stopped without hiding its error.
import { startWorker, type Worker } from "@travel-crm/domain/jobs";
import { createRateLimiter } from "@travel-crm/domain/rate-limits";
import { createMemoryEmailSender, type MemoryEmailSender } from "@travel-crm/integrations/email";
import { createPgBossJobs, type PgBossJobs } from "@travel-crm/integrations/jobs";
import { createMemoryPushSender } from "@travel-crm/integrations/push";
import { createS3Storage } from "@travel-crm/integrations/storage";
import { randomBytes } from "node:crypto";
import { inject } from "vitest";
import { problemLogger } from "./problem-logger.js";
import { logWorkerProblem } from "../../src/worker-problem.js";
import { workerJobs, type WorkerJobs } from "../../src/worker-jobs.js";
import { startMinio, type TestMinio } from "./minio.js";
import { createTestAgency, createTestServer, type TestAgency, type TestServer } from "./test-server.js";
import type { CountingWebhookProvider } from "./webhook-provider.js";

/**
 * The same pg-boss with every queue name carrying this flow's own prefix. All test files share one database, and a
 * pg-boss worker takes any job on a queue of that name, so without a prefix one file's worker runs another file's jobs
 * with the wrong providers. What comes back is without the prefix again.
 */
function withOwnQueues(jobs: PgBossJobs): PgBossJobs {
  const prefix = `t${randomBytes(4).toString("hex")}.`;
  const own = (queue: string) => `${prefix}${queue}`;
  const hasPrefix = (queue: string) => queue.startsWith(prefix);
  const bare = (queue: string) => queue.slice(prefix.length);
  return {
    start: () => jobs.start(),
    stop: () => jobs.stop(),
    send: (queue, data, options) => jobs.send(own(queue), data, options),
    work: (queue, handler, options) => jobs.work(own(queue), handler, options),
    schedule: (queue, cron, options) => jobs.schedule(own(queue), cron, options),
    unschedule: (queue) => jobs.unschedule(own(queue)),
    retryFailedJob: (queue, jobId) => jobs.retryFailedJob(own(queue), jobId),
    schedules: async () =>
      (await jobs.schedules()).filter((s) => hasPrefix(s.queue)).map((s) => ({ ...s, queue: bare(s.queue) })),
    failedJobs: async (options) =>
      (await jobs.failedJobs(options?.queue === undefined ? options : { ...options, queue: own(options.queue) }))
        .filter((job) => hasPrefix(job.queue))
        .map((job) => ({ ...job, queue: bare(job.queue) })),
  };
}

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
  const jobs = withOwnQueues(
    createPgBossJobs({
      connectionString: inject("dbUrls").runtime,
      maxConnections: 3,
      pollingIntervalSeconds: 0.5,
      retryPolicy: { retryLimit: 1, retryDelaySeconds: 1, retryDelayMaxSeconds: 1 },
      logger: problemLogger(reported),
    }),
  );
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
    spreadsheets: server.spreadsheets,
    subscriptions: server.subscriptions,
    seatLimit: server.seatLimit,
    email,
    push: createMemoryPushSender(),
    appUrl: "https://app.example.in",
    webhookProviders: [webhooks.provider],
    rateLimiter: createRateLimiter(server.db, { keySecret: "worker-flow-test-rate-limit-secret-of-32-bytes" }),
    logger: problemLogger(reported),
  });
  running.worker = await startWorker({
    db: server.db,
    runner: jobs,
    queue: jobs,
    ...work,
    // Only this flow's organization: other test files share the database.
    relay: { intervalMs: 100, organizationIds: [agency.organizationId] },
    onError: logWorkerProblem(problemLogger(reported)),
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
