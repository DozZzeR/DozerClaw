import type { MonitoredService } from "../../../core/domain/service-health/monitored-service.js";
import type { ServiceRegistryRepositoryPort } from "../../../ports/service-registry-repository-port.js";

export interface ListMonitoredServicesDependencies {
  readonly repository: ServiceRegistryRepositoryPort;
}

export class ListMonitoredServicesUseCase {
  constructor(private readonly dependencies: ListMonitoredServicesDependencies) {}

  execute(): Promise<readonly MonitoredService[]> {
    return this.dependencies.repository.listEnabledMonitoredServices();
  }
}
