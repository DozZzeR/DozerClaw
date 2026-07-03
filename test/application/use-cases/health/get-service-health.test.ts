import { describe, expect, it } from "vitest";

import { GetServiceHealthUseCase } from "../../../../src/application/use-cases/health/get-service-health.js";
import type {
  ServiceHealthSnapshot,
  ServiceMonitorPort
} from "../../../../src/ports/service-monitor-port.js";

describe("GetServiceHealthUseCase", () => {
  it("returns service health from the service monitor", async () => {
    const snapshots: readonly ServiceHealthSnapshot[] = [
      {
        name: "planner",
        status: "ok",
        detail: "responding",
        checkedAt: new Date("2026-07-03T08:00:00.000Z")
      }
    ];
    const useCase = new GetServiceHealthUseCase({
      serviceMonitor: {
        async listServiceHealth() {
          return snapshots;
        }
      } satisfies ServiceMonitorPort
    });

    await expect(useCase.execute()).resolves.toBe(snapshots);
  });
});
