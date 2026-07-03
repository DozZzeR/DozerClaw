import { describe, expect, it } from "vitest";

import { RegistryServiceMonitor } from "../../../src/infrastructure/providers/local-monitor/registry-service-monitor.js";
import type { ServiceRegistryRepositoryPort } from "../../../src/ports/service-registry-repository-port.js";

describe("RegistryServiceMonitor", () => {
  it("reports enabled manual services as unknown", async () => {
    const monitor = new RegistryServiceMonitor({
      repository: {
        async saveMonitoredService() {},
        async listEnabledMonitoredServices() {
          return [
            {
              id: "service-mempalace",
              name: "mempalace",
              healthSourceKind: "manual",
              enabled: true,
              createdAt: new Date("2026-07-03T10:00:00.000Z"),
              updatedAt: new Date("2026-07-03T10:00:00.000Z")
            }
          ];
        }
      } satisfies ServiceRegistryRepositoryPort,
      now: () => new Date("2026-07-03T10:01:00.000Z")
    });

    await expect(monitor.listServiceHealth()).resolves.toEqual([
      {
        name: "mempalace",
        status: "unknown",
        detail: "manual service has no automatic check",
        checkedAt: new Date("2026-07-03T10:01:00.000Z")
      }
    ]);
  });
});
