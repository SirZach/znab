import { describe, expect, test } from "bun:test";
import { auditAction } from "./audit";

const row = { id: 1, budgetId: 1, deletedAt: null };

describe("auditAction", () => {
  test("a row with nothing before it was created", () => {
    expect(auditAction(undefined, row)).toBe("create");
  });

  test("a row with nothing after it was removed outright", () => {
    expect(auditAction(row, undefined)).toBe("delete");
  });

  test("setting deletedAt is a delete; anything else is an update", () => {
    const gone = { ...row, deletedAt: new Date() };
    expect(auditAction(row, gone)).toBe("delete");
    expect(auditAction(row, row)).toBe("update");
    expect(auditAction(gone, gone)).toBe("update");
  });
});
