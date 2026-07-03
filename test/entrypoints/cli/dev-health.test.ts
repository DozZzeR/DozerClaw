import { describe, expect, it } from "vitest";

import { runDevHealthHarness } from "../../../src/entrypoints/cli/dev-health.js";

describe("runDevHealthHarness", () => {
  it("bootstraps owner and prints system health output", async () => {
    const output: string[] = [];

    await expect(
      runDevHealthHarness({
        env: {
          NODE_ENV: "test",
          DOZERCLAW_DB_PATH: ":memory:"
        },
        write(line) {
          output.push(line);
        }
      })
    ).resolves.toBe(0);

    expect(output.join("\n")).toContain("System health:");
    expect(output.join("\n")).toContain("Uptime:");
    expect(output.join("\n")).toContain("Memory:");
  });

  it("is blocked in production mode", async () => {
    const output: string[] = [];

    await expect(
      runDevHealthHarness({
        env: {
          NODE_ENV: "production",
          DOZERCLAW_DB_PATH: ":memory:"
        },
        write(line) {
          output.push(line);
        }
      })
    ).resolves.toBe(1);

    expect(output).toEqual([
      "dev health harness is not available in production."
    ]);
  });
});
