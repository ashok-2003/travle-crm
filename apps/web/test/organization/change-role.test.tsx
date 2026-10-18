// Changing someone's role shows the new role at once and takes it back, with the api's reason, if the api refuses.
// Two quick changes must not disturb each other: a refusal gives back only its own row, and the list is refreshed
// once, after the last change has been answered.
import type { RoleSummary, StaffMember } from "@travel-crm/contracts/identity";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTRPC } from "@/data/trpc";
import { useChangeStaffRole } from "@/organization/staff/use-staff";
import { fakeApi, newQueryClient, withApp } from "./api";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const person = (id: string, name: string, roleKey: string, roleName: string): StaffMember => ({
  memberId: id,
  userId: `user-${id}`,
  name,
  email: null,
  username: name.toLowerCase(),
  role: { key: roleKey, name: roleName, isOwner: false },
  twoFactorEnabled: false,
  mustChangePassword: false,
  joinedAt: "2026-01-02T05:00:00.000Z",
});

const staff = [person("m1", "Ravi", "sales", "Sales"), person("m2", "Meera", "sales", "Sales")];
const roles: RoleSummary[] = [
  { key: "sales", name: "Sales", isOwner: false, permissions: [], memberCount: 2 },
  { key: "admin", name: "Admin", isOwner: false, permissions: [], memberCount: 0 },
];

function setup() {
  const api = fakeApi();
  const queryClient = newQueryClient();
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const hook = renderHook(
    () => {
      const trpc = useTRPC();
      return { trpc, change: useChangeStaffRole() };
    },
    { wrapper: withApp(queryClient) },
  );
  queryClient.setQueryData(hook.result.current.trpc.staff.list.queryKey(), staff);
  queryClient.setQueryData(hook.result.current.trpc.roles.list.queryKey(), roles);
  const roleOf = (id: string) =>
    queryClient
      .getQueryData<StaffMember[]>(hook.result.current.trpc.staff.list.queryKey())
      ?.find((member) => member.memberId === id)?.role.name;
  const mutate = (memberId: string) => {
    act(() => {
      hook.result.current.change.mutate({ memberId, roleKey: "admin" });
    });
  };
  return { api, invalidate, roleOf, mutate };
}

describe("useChangeStaffRole", () => {
  beforeEach(() => {
    toast.success.mockClear();
    toast.error.mockClear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the new role before the api answers, and keeps it once the api agrees", async () => {
    const { api, roleOf, mutate } = setup();
    mutate("m1");
    await waitFor(() => {
      expect(roleOf("m1")).toBe("Admin");
    });
    expect(api.calls).toHaveLength(1);
    await act(async () => {
      api.last().answer(person("m1", "Ravi", "admin", "Admin"));
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Ravi is now Admin");
    });
    expect(roleOf("m1")).toBe("Admin");
  });

  it("goes back to the old role and says why when the api refuses", async () => {
    const { api, roleOf, mutate } = setup();
    mutate("m1");
    await waitFor(() => {
      expect(roleOf("m1")).toBe("Admin");
    });
    await act(async () => {
      api.last().refuse(409, "LAST_OWNER");
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(roleOf("m1")).toBe("Sales");
    });
    expect(toast.error).toHaveBeenCalledWith("The organization needs at least one Owner.", { duration: Infinity });
  });

  it("gives back only its own row when another change is still on its way, and refreshes once at the end", async () => {
    const { api, invalidate, roleOf, mutate } = setup();
    mutate("m1");
    await waitFor(() => {
      expect(api.calls).toHaveLength(1);
    });
    mutate("m2");
    await waitFor(() => {
      expect(api.calls).toHaveLength(2);
    });
    expect(roleOf("m2")).toBe("Admin");

    const [first, second] = api.calls;
    await act(async () => {
      first?.refuse(409, "STAFF_CHANGED");
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
    expect(roleOf("m1")).toBe("Sales");
    expect(roleOf("m2")).toBe("Admin");
    expect(invalidate).not.toHaveBeenCalled();

    await act(async () => {
      second?.answer(person("m2", "Meera", "admin", "Admin"));
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalled();
    });
    expect(roleOf("m2")).toBe("Admin");
  });
});
