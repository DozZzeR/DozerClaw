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

  it("reports local path services as ok when the path exists", async () => {
    const monitor = new RegistryServiceMonitor({
      repository: {
        async saveMonitoredService() {},
        async listEnabledMonitoredServices() {
          return [
            {
              id: "service-mempalace",
              name: "mempalace",
              healthSourceKind: "local_path",
              healthSourceConfig: {
                path: "/opt/services/mem-palace"
              },
              enabled: true,
              createdAt: new Date("2026-07-03T10:00:00.000Z"),
              updatedAt: new Date("2026-07-03T10:00:00.000Z")
            }
          ];
        }
      } satisfies ServiceRegistryRepositoryPort,
      pathExists: async () => true,
      now: () => new Date("2026-07-03T10:01:00.000Z")
    });

    await expect(monitor.listServiceHealth()).resolves.toEqual([
      {
        name: "mempalace",
        status: "ok",
        detail: "path exists: /opt/services/mem-palace",
        checkedAt: new Date("2026-07-03T10:01:00.000Z")
      }
    ]);
  });

  it("reports local path services as failed when the path is missing", async () => {
    const monitor = new RegistryServiceMonitor({
      repository: {
        async saveMonitoredService() {},
        async listEnabledMonitoredServices() {
          return [
            {
              id: "service-taskframe",
              name: "taskframe",
              healthSourceKind: "local_path",
              healthSourceConfig: {
                path: "/opt/services/taskframe"
              },
              enabled: true,
              createdAt: new Date("2026-07-03T10:00:00.000Z"),
              updatedAt: new Date("2026-07-03T10:00:00.000Z")
            }
          ];
        }
      } satisfies ServiceRegistryRepositoryPort,
      pathExists: async () => false,
      now: () => new Date("2026-07-03T10:01:00.000Z")
    });

    await expect(monitor.listServiceHealth()).resolves.toEqual([
      {
        name: "taskframe",
        status: "failed",
        detail: "path missing: /opt/services/taskframe",
        checkedAt: new Date("2026-07-03T10:01:00.000Z")
      }
    ]);
  });

  it("reports HTTP health services as ok for 2xx responses", async () => {
    const monitor = new RegistryServiceMonitor({
      repository: {
        async saveMonitoredService() {},
        async listEnabledMonitoredServices() {
          return [
            {
              id: "service-taskframe",
              name: "taskframe",
              healthSourceKind: "http_health",
              healthSourceConfig: {
                url: "http://127.0.0.1:3100/health",
                timeoutMs: 1500
              },
              enabled: true,
              createdAt: new Date("2026-07-03T10:00:00.000Z"),
              updatedAt: new Date("2026-07-03T10:00:00.000Z")
            }
          ];
        }
      } satisfies ServiceRegistryRepositoryPort,
      httpRequest: async () => ({ status: 204 }),
      now: () => new Date("2026-07-03T10:01:00.000Z")
    });

    await expect(monitor.listServiceHealth()).resolves.toEqual([
      {
        name: "taskframe",
        status: "ok",
        detail: "HTTP 204: http://127.0.0.1:3100/health",
        checkedAt: new Date("2026-07-03T10:01:00.000Z")
      }
    ]);
  });

  it("reports HTTP health services as failed for non-2xx responses", async () => {
    const monitor = new RegistryServiceMonitor({
      repository: {
        async saveMonitoredService() {},
        async listEnabledMonitoredServices() {
          return [
            {
              id: "service-taskframe",
              name: "taskframe",
              healthSourceKind: "http_health",
              healthSourceConfig: {
                url: "http://127.0.0.1:3100/health"
              },
              enabled: true,
              createdAt: new Date("2026-07-03T10:00:00.000Z"),
              updatedAt: new Date("2026-07-03T10:00:00.000Z")
            }
          ];
        }
      } satisfies ServiceRegistryRepositoryPort,
      httpRequest: async () => ({ status: 503 }),
      now: () => new Date("2026-07-03T10:01:00.000Z")
    });

    await expect(monitor.listServiceHealth()).resolves.toEqual([
      {
        name: "taskframe",
        status: "failed",
        detail: "HTTP 503: http://127.0.0.1:3100/health",
        checkedAt: new Date("2026-07-03T10:01:00.000Z")
      }
    ]);
  });

  it("reports HTTP health services as failed when the request throws", async () => {
    const monitor = new RegistryServiceMonitor({
      repository: {
        async saveMonitoredService() {},
        async listEnabledMonitoredServices() {
          return [
            {
              id: "service-taskframe",
              name: "taskframe",
              healthSourceKind: "http_health",
              healthSourceConfig: {
                url: "http://127.0.0.1:3100/health"
              },
              enabled: true,
              createdAt: new Date("2026-07-03T10:00:00.000Z"),
              updatedAt: new Date("2026-07-03T10:00:00.000Z")
            }
          ];
        }
      } satisfies ServiceRegistryRepositoryPort,
      httpRequest: async () => {
        throw new Error("connection refused");
      },
      now: () => new Date("2026-07-03T10:01:00.000Z")
    });

    await expect(monitor.listServiceHealth()).resolves.toEqual([
      {
        name: "taskframe",
        status: "failed",
        detail: "HTTP request failed: connection refused",
        checkedAt: new Date("2026-07-03T10:01:00.000Z")
      }
    ]);
  });
});
