import type {
  ServiceHealthSnapshot,
  ServiceMonitorPort
} from "../../../ports/service-monitor-port.js";
import type { ServiceRegistryRepositoryPort } from "../../../ports/service-registry-repository-port.js";

export interface RegistryServiceMonitorOptions {
  readonly repository: ServiceRegistryRepositoryPort;
  readonly now?: () => Date;
}

export class RegistryServiceMonitor implements ServiceMonitorPort {
  private readonly now: () => Date;

  constructor(private readonly options: RegistryServiceMonitorOptions) {
    this.now = options.now ?? (() => new Date());
  }

  async listServiceHealth(): Promise<readonly ServiceHealthSnapshot[]> {
    const services = await this.options.repository.listEnabledMonitoredServices();

    return services.map((service) => ({
      name: service.name,
      status: "unknown",
      detail: "manual service has no automatic check",
      checkedAt: this.now()
    }));
  }
}
