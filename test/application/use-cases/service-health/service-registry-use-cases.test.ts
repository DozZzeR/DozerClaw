import { describe, expect, it } from "vitest";

import { ListMonitoredServicesUseCase } from "../../../../src/application/use-cases/service-health/list-monitored-services.js";
import { RegisterMonitoredServiceUseCase } from "../../../../src/application/use-cases/service-health/register-monitored-service.js";
import type { MonitoredService } from "../../../../src/core/domain/service-health/monitored-service.js";
import type { ServiceRegistryRepositoryPort } from "../../../../src/ports/service-registry-repository-port.js";

describe("service registry use cases", () => {
  it("registers a monitored service through the repository", async () => {
    const savedServices: MonitoredService[] = [];
    const useCase = new RegisterMonitoredServiceUseCase({
      repository: {
        async saveMonitoredService(service) {
          savedServices.push(service);
        },
        async listEnabledMonitoredServices() {
          return [];
        }
      } satisfies ServiceRegistryRepositoryPort
    });
    const service: MonitoredService = {
      id: "service-1",
      name: "planner",
      healthSourceKind: "manual",
      enabled: true,
      createdAt: new Date("2026-07-03T09:00:00.000Z"),
      updatedAt: new Date("2026-07-03T09:00:00.000Z")
    };

    await expect(useCase.execute(service)).resolves.toEqual(service);
    expect(savedServices).toEqual([service]);
  });

  it("lists enabled monitored services through the repository", async () => {
    const service: MonitoredService = {
      id: "service-1",
      name: "planner",
      healthSourceKind: "manual",
      enabled: true,
      createdAt: new Date("2026-07-03T09:00:00.000Z"),
      updatedAt: new Date("2026-07-03T09:00:00.000Z")
    };
    const useCase = new ListMonitoredServicesUseCase({
      repository: {
        async saveMonitoredService() {},
        async listEnabledMonitoredServices() {
          return [service];
        }
      } satisfies ServiceRegistryRepositoryPort
    });

    await expect(useCase.execute()).resolves.toEqual([service]);
  });
});
