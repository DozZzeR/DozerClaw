import { describe, expect, it } from "vitest";

import { LocalServerMonitor } from "../../../src/infrastructure/providers/local-monitor/local-server-monitor.js";

describe("LocalServerMonitor", () => {
  it("returns a host health snapshot from local runtime APIs", async () => {
    const monitor = new LocalServerMonitor();

    const snapshot = await monitor.getHostHealth();

    expect(snapshot.checkedAt).toBeInstanceOf(Date);
    expect(snapshot.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(snapshot.loadAverage).toHaveLength(3);
    expect(snapshot.loadAverage.every((value) => value >= 0)).toBe(true);
    expect(snapshot.memory.totalBytes).toBeGreaterThan(0);
    expect(snapshot.memory.freeBytes).toBeGreaterThanOrEqual(0);
    expect(snapshot.memory.freeBytes).toBeLessThanOrEqual(
      snapshot.memory.totalBytes
    );
  });
});
