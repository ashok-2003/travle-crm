// Who or what an export and an erasure are about, as typed: a removed member by id, or a record of a person by its type
// and id, turned into the api's subject by its own schema (erasureSubject), each problem named for its field.
import { erasureSubject, type ErasureSubject } from "@travel-crm/contracts/platform";

export interface SubjectValues {
  kind: "member" | "record";
  memberId: string;
  recordType: string;
  recordId: string;
}

export type SubjectField = Exclude<keyof SubjectValues, "kind">;

/** Message keys in the "consolePlatform.dataProtection.subject" namespace. */
export type SubjectProblem = "idInvalid" | "recordTypeInvalid";

const problemOf: Record<SubjectField, SubjectProblem> = {
  memberId: "idInvalid",
  recordType: "recordTypeInvalid",
  recordId: "idInvalid",
};

const isField = (value: unknown): value is SubjectField =>
  value === "memberId" || value === "recordType" || value === "recordId";

export function toErasureSubject(
  values: SubjectValues,
): { ok: true; subject: ErasureSubject } | { ok: false; problems: Partial<Record<SubjectField, SubjectProblem>> } {
  const parsed = erasureSubject.safeParse(
    values.kind === "member"
      ? { kind: "member", memberId: values.memberId.trim() }
      : { kind: "record", recordType: values.recordType.trim(), recordId: values.recordId.trim() },
  );
  if (parsed.success) return { ok: true, subject: parsed.data };
  const problems: Partial<Record<SubjectField, SubjectProblem>> = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0];
    if (isField(field)) problems[field] = problemOf[field];
  }
  return { ok: false, problems };
}
