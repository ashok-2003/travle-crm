// A visitor's enquiry from a package page, or their request to join one departure (release 7b): a lead through the website
// form's save path, with a first note, and, when they join a departure, a task for the lead's owner to hold the seats, make a
// quote or add them to the waitlist (the scope's "booking request" would be a nameless booking, so a task it is). Done in the
// caller's transaction; the caller reruns it once on a unique violation.
import type { PackageEnquiryInput } from "@travel-crm/contracts/package-pages";
import type { OrgTx } from "@travel-crm/db";
import { departureUnavailable, receivePackageEnquiry, type PackageEnquiryOutcome } from "../crm/index.js";
import { publicDepartures } from "../departures/index.js";
import { DomainError, publicActor } from "../kernel/index.js";
import { createTask } from "../tasks/index.js";
import { publishedPackage } from "./read.js";

export const pageUnavailable = () => new DomainError("NOT_FOUND", "PAGE_UNAVAILABLE", "This page is not available");

export interface PackageEnquiryServices {
  organizationId: string;
  ownerUserId: string;
  workers: ReadonlySet<string>;
  today: string;
  now: Date;
}

export async function receiveEnquiryOnPackage(
  tx: OrgTx,
  services: PackageEnquiryServices,
  slug: string,
  input: PackageEnquiryInput,
): Promise<PackageEnquiryOutcome> {
  const row = await publishedPackage(tx, slug, { organizationId: services.organizationId, now: services.now });
  if (row === null) throw pageUnavailable();
  let departure = null;
  if (input.departureId !== undefined) {
    // Only a departure the page lists: at the package's destination, upcoming and not closed.
    const listed = (
      await publicDepartures(tx, {
        destinationId: row.destinationId,
        packageId: row.id,
        today: services.today,
        now: services.now,
      })
    ).find((candidate) => candidate.id === input.departureId);
    if (listed === undefined) throw departureUnavailable();
    departure = {
      id: listed.id,
      title: listed.title,
      startDate: listed.startDate,
      endDate: listed.endDate,
      full: listed.word === "full",
    };
  }
  const result = await receivePackageEnquiry(
    tx,
    {
      organizationId: services.organizationId,
      ownerUserId: services.ownerUserId,
      workers: services.workers,
      package: { id: row.id, name: row.name, destinationId: row.destinationId },
      departure,
      now: services.now,
    },
    input,
  );
  const seats = input.answers.travellers ?? 1;
  if (
    departure !== null &&
    result.leadId !== null &&
    (result.outcome === "new_lead" || result.outcome === "repeat_enquiry")
  ) {
    const verb = departure.full ? "Add to the waitlist" : "Hold seats or make a quote";
    await createTask(tx, publicActor(services.organizationId), {
      kind: "task",
      title:
        `${verb}: ${input.answers.name}, ${String(seats)} ${seats === 1 ? "seat" : "seats"} on ${departure.title}`.slice(
          0,
          200,
        ),
      dueAt: services.now,
      assigneeUserId: result.leadOwnerUserId ?? services.ownerUserId,
      record: { recordType: "lead", recordId: result.leadId },
    });
  }
  return result.outcome;
}
