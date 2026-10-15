"use client";

// The fields of the role editor. They start from the saved role. When the saved role changes under the editor (a focus
// refetch, the api's answer replacing a cached copy, another admin), untouched fields follow it; fields with unsaved
// edits are kept, and `changedUnderYou` says so, so the editor can warn instead of silently dropping the edits.
import type { RoleSummary } from "@travel-crm/contracts/identity";
import { useState } from "react";
import type { Grant } from "./permission-grants";

const sameGrants = (a: Grant[], b: Grant[]) => {
  const key = (grants: Grant[]) =>
    JSON.stringify(
      grants
        .map(({ permission, scope }) => ({ permission, scope }))
        .sort((x, y) => x.permission.localeCompare(y.permission)),
    );
  return key(a) === key(b);
};

const sameRole = (a: Pick<RoleSummary, "name" | "permissions">, b: Pick<RoleSummary, "name" | "permissions">) =>
  a.name === b.name && sameGrants(a.permissions, b.permissions);

export function useEditableRole(role: RoleSummary) {
  const [name, setName] = useState(role.name);
  const [grants, setGrants] = useState<Grant[]>(role.permissions);
  // The saved role the fields were last in step with.
  const [loaded, setLoaded] = useState(role);

  const edits = { name, permissions: grants };
  let changedUnderYou = false;
  if (!sameRole(role, loaded)) {
    if (sameRole(edits, loaded) || sameRole(edits, role)) {
      // Nothing of the person's would be lost: follow the saved role (this is also the case right after their own save).
      setLoaded(role);
      setName(role.name);
      setGrants(role.permissions);
    } else {
      changedUnderYou = true;
    }
  }

  return {
    name,
    setName,
    grants,
    setGrants,
    changedUnderYou,
    /** Drops the edits and shows the saved role. */
    loadSaved: () => {
      setLoaded(role);
      setName(role.name);
      setGrants(role.permissions);
    },
  };
}
