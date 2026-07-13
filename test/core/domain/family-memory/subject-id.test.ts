import { describe, expect, it } from "vitest";

import { normalizeSubjectId } from "../../../../src/core/domain/family-memory/subject-id.js";

describe("normalizeSubjectId", () => {
  it("normalizes casing, prefixes, and separators", () => {
    expect(normalizeSubjectId("  Child: Max Smith  ")).toBe("max-smith");
    expect(normalizeSubjectId("Person/Maksim")).toBe("maksim");
    expect(normalizeSubjectId("family-member#Sofia Rose")).toBe("sofia-rose");
  });

  it("preserves Cyrillic letters", () => {
    expect(normalizeSubjectId(" Ребенок Макс ")).toBe("ребенок-макс");
  });

  it("omits blank normalized values", () => {
    expect(normalizeSubjectId(undefined)).toBeUndefined();
    expect(normalizeSubjectId(" : -- ")).toBeUndefined();
  });
});
