import { describe, expect, it } from "vitest";

import {
  StateDataError,
  safeJsonParse
} from "../../../src/infrastructure/providers/sqlite/sqlite-state-repository.js";

describe("safeJsonParse", () => {
  it("parses valid JSON", () => {
    expect(safeJsonParse('{"a":1}', "ctx")).toEqual({ a: 1 });
  });

  it("throws a StateDataError with the column context on corrupt JSON", () => {
    expect(() => safeJsonParse("{not json", "pending_state.shopping_items")).toThrow(
      StateDataError
    );

    try {
      safeJsonParse("{not json", "pending_state.shopping_items");
    } catch (error) {
      expect(error).toBeInstanceOf(StateDataError);
      expect((error as StateDataError).message).toContain(
        "pending_state.shopping_items"
      );
    }
  });

  it("does not leak the raw payload in the error message", () => {
    const secret = '{"body":"SECRET family detail","broken"';

    try {
      safeJsonParse(secret, "family_facts");
    } catch (error) {
      expect((error as Error).message).not.toContain("SECRET family detail");
    }
  });
});
