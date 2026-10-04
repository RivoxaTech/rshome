import { describe, expect, it } from "vitest";
import { ACCESS_CONTROL_PERMISSIONS, PERMISSION_GROUPS } from "./permission-groups";
import { PERMISSIONS } from "./permissions";

describe("PERMISSION_GROUPS", () => {
  it("lists every permission key exactly once", () => {
    const listed = PERMISSION_GROUPS.flatMap((group) => group.permissions);
    expect(new Set(listed).size).toBe(listed.length);
    expect(new Set(listed)).toEqual(new Set(Object.values(PERMISSIONS)));
  });

  it("flags the two access-control keys and nothing else", () => {
    expect(new Set(ACCESS_CONTROL_PERMISSIONS)).toEqual(new Set([PERMISSIONS.USER_MANAGE, PERMISSIONS.ROLE_MANAGE]));
  });
});
