import { describe, expect, it } from "vitest";

import { LocalServiceMonitor } from "../../../src/infrastructure/providers/local-monitor/local-service-monitor.js";

describe("LocalServiceMonitor", () => {
  it("returns no snapshots when no service checks are configured", async () => {
    const monitor = new LocalServiceMonitor();

    await expect(monitor.listServiceHealth()).resolves.toEqual([]);
  });

  it("returns snapshots for configured service checks", async () => {
    const monitor = new LocalServiceMonitor({
      checks: [
        {
          name: "planner",
          async check() {
            return {
              status: "ok",
              detail: "responding"
            };
          }
        }
      ],
      now: () => new Date("2026-07-03T08:00:00.000Z")
    });

    await expect(monitor.listServiceHealth()).resolves.toEqual([
      {
        name: "planner",
        status: "ok",
        detail: "responding",
        checkedAt: new Date("2026-07-03T08:00:00.000Z")
      }
    ]);
  });

  it("returns a failed snapshot when a service check throws", async () => {
    const monitor = new LocalServiceMonitor({
      checks: [
        {
          name: "planner",
          async check() {
            throw new Error("connection refused");
          }
        }
      ],
      now: () => new Date("2026-07-03T08:00:00.000Z")
    });

    await expect(monitor.listServiceHealth()).resolves.toEqual([
      {
        name: "planner",
        status: "failed",
        detail: "connection refused",
        checkedAt: new Date("2026-07-03T08:00:00.000Z")
      }
    ]);
  });
});
