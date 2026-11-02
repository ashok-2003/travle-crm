// The system's health (the owner, 2026-11-02): something that broke (the AI, jobs, the api, the worker), reported by any
// process as a job for the console, kept as an incident, emailed to the super admins and shown on the console's
// dashboard until it has been quiet a while. A report holds a kind and a short code, never personal data.
import { z } from "zod";
import { recordId } from "../identity/index.js";

export const incidentKinds = [
  "ai.unavailable",
  "ai.rate-limited",
  "jobs.failed",
  "api.errors",
  "worker.stalled",
] as const;
export const incidentKind = z.enum(incidentKinds);
export type IncidentKind = z.infer<typeof incidentKind>;

/** The job a process sends when something broke: what kind, and a short code (a feature, a queue, an error's name). */
export const incidentReport = z.object({ kind: incidentKind, detail: z.string().max(200) });
export type IncidentReport = z.infer<typeof incidentReport>;

export const platformIncident = z.object({
  id: recordId,
  kind: incidentKind,
  detail: z.string(),
  openedAt: z.iso.datetime(),
  lastSeenAt: z.iso.datetime(),
  /** Null while it is still happening. */
  resolvedAt: z.iso.datetime().nullable(),
  /** How many times it was reported. */
  reports: z.int().min(1),
});
export type PlatformIncident = z.infer<typeof platformIncident>;

/** What is broken now, and what broke in the last week and recovered. */
export const platformIncidents = z.object({
  open: z.array(platformIncident),
  recent: z.array(platformIncident),
});
export type PlatformIncidents = z.infer<typeof platformIncidents>;
