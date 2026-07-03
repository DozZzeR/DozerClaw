import { stat } from "node:fs/promises";

import type { MonitoredService } from "../../../core/domain/service-health/monitored-service.js";
import type {
  ServiceHealthSnapshot,
  ServiceMonitorPort
} from "../../../ports/service-monitor-port.js";
import type { ServiceRegistryRepositoryPort } from "../../../ports/service-registry-repository-port.js";

export interface RegistryServiceMonitorOptions {
  readonly repository: ServiceRegistryRepositoryPort;
  readonly pathExists?: (path: string) => Promise<boolean>;
  readonly now?: () => Date;
}

export class RegistryServiceMonitor implements ServiceMonitorPort {
  private readonly now: () => Date;
  private readonly pathExists: (path: string) => Promise<boolean>;

  constructor(private readonly options: RegistryServiceMonitorOptions) {
    this.now = options.now ?? (() => new Date());
    this.pathExists = options.pathExists ?? defaultPathExists;
  }

  async listServiceHealth(): Promise<readonly ServiceHealthSnapshot[]> {
    const services = await this.options.repository.listEnabledMonitoredServices();

    return Promise.all(services.map((service) => this.inspectService(service)));
  }

  private async inspectService(
    service: MonitoredService
  ): Promise<ServiceHealthSnapshot> {
    if (service.healthSourceKind === "local_path") {
      const path = service.healthSourceConfig?.path;

      if (!path) {
        return {
          name: service.name,
          status: "failed",
          detail: "local_path service missing path config",
          checkedAt: this.now()
        };
      }

      const exists = await this.pathExists(path);

      return {
        name: service.name,
        status: exists ? "ok" : "failed",
        detail: exists ? `path exists: ${path}` : `path missing: ${path}`,
        checkedAt: this.now()
      };
    }

    return {
      name: service.name,
      status: "unknown",
      detail: "manual service has no automatic check",
      checkedAt: this.now()
    };
  }
}

async function defaultPathExists(path: string): Promise<boolean> {
  try {
    await stat(path);

    return true;
  } catch {
    return false;
  }
}
