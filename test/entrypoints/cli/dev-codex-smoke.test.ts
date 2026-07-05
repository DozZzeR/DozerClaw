import { describe, expect, it } from "vitest";

import { runDevCodexSmoke } from "../../../src/entrypoints/cli/dev-codex-smoke.js";
import type { ModelPort } from "../../../src/ports/model-port.js";

describe("runDevCodexSmoke", () => {
  it("runs the configured model provider outside production", async () => {
    const lines: string[] = [];
    const modelProvider = new FakeModelProvider("DOZERCLAW_CODEX_SMOKE_OK");

    await expect(
      runDevCodexSmoke({
        env: {
          NODE_ENV: "test"
        },
        write(line) {
          lines.push(line);
        },
        modelProvider
      })
    ).resolves.toBe(0);
    expect(lines).toEqual(["DOZERCLAW_CODEX_SMOKE_OK"]);
    expect(modelProvider.request?.purpose).toBe(
      "DozerClaw Codex provider smoke test"
    );
  });

  it("is blocked in production mode", async () => {
    const lines: string[] = [];

    await expect(
      runDevCodexSmoke({
        env: {
          NODE_ENV: "production"
        },
        write(line) {
          lines.push(line);
        },
        modelProvider: new FakeModelProvider("unused")
      })
    ).resolves.toBe(1);
    expect(lines).toEqual(["dev codex smoke is not available in production."]);
  });
});

class FakeModelProvider implements ModelPort {
  request: Parameters<ModelPort["runTextRequest"]>[0] | undefined;

  constructor(private readonly text: string) {}

  async runTextRequest(request: Parameters<ModelPort["runTextRequest"]>[0]) {
    this.request = request;

    return {
      text: this.text
    };
  }
}
