import { describe, expect, it } from "vitest";

import { buildApp } from "../../src/composition/build-app.js";

describe("buildApp", () => {
  it("composes the application and exposes startup diagnostics", () => {
    const app = buildApp();

    expect(app.getStartupDiagnostics()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "composition",
          status: "ok"
        })
      ])
    );
  });
});
