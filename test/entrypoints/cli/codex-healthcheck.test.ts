import { describe, expect, it } from "vitest";

import { runCodexHealthcheck } from "../../../src/entrypoints/cli/codex-healthcheck.js";
import type { ModelTextRequest } from "../../../src/ports/model-port.js";

describe("runCodexHealthcheck", () => {
  it("runs in production and returns 0 when expected token is echoed", async () => {
    const lines: string[] = [];
    let seenRequest: ModelTextRequest | undefined;

    const exitCode = await runCodexHealthcheck({
      env: { NODE_ENV: "production" },
      write(line) {
        lines.push(line);
      },
      modelProvider: {
        async runTextRequest(request) {
          seenRequest = request;
          return { text: "DOZERCLAW_CODEX_SMOKE_OK" };
        }
      }
    });

    expect(exitCode).toBe(0);
    expect(lines).toEqual(["DOZERCLAW_CODEX_SMOKE_OK"]);
    expect(seenRequest?.input).toContain("DOZERCLAW_CODEX_SMOKE_OK");
  });

  it("returns 1 when the model output does not contain the expected token", async () => {
    const lines: string[] = [];

    const exitCode = await runCodexHealthcheck({
      env: { NODE_ENV: "production" },
      write(line) {
        lines.push(line);
      },
      modelProvider: {
        async runTextRequest() {
          return { text: "unexpected response" };
        }
      }
    });

    expect(exitCode).toBe(1);
    expect(lines).toEqual(["unexpected response"]);
  });
});
