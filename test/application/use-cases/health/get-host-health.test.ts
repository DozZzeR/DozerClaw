import { describe, expect, it } from "vitest";

import { GetHostHealthUseCase } from "../../../../src/application/use-cases/health/get-host-health.js";
import type {
  HostHealthSnapshot,
  ServerMonitorPort
} from "../../../../src/ports/server-monitor-port.js";

describe("GetHostHealthUseCase", () => {
  it("returns host health from the server monitor", async () => {
    const snapshot: HostHealthSnapshot = {
      checkedAt: new Date("2026-07-02T20:00:00.000Z"),
      uptimeSeconds: 123,
      loadAverage: [1, 2, 3],
      memory: {
        totalBytes: 1000,
        freeBytes: 250
      }
    };
    const useCase = new GetHostHealthUseCase({
      serverMonitor: {
        async getHostHealth() {
          return snapshot;
        }
      } satisfies ServerMonitorPort
    });

    await expect(useCase.execute()).resolves.toBe(snapshot);
  });
});
