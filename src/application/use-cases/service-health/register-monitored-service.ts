import type { MonitoredService } from "../../../core/domain/service-health/monitored-service.js";
import type { ServiceRegistryRepositoryPort } from "../../../ports/service-registry-repository-port.js";

export interface RegisterMonitoredServiceDependencies {
  readonly repository: ServiceRegistryRepositoryPort;
}

export class RegisterMonitoredServiceUseCase {
  constructor(
    private readonly dependencies: RegisterMonitoredServiceDependencies
  ) {}

  async execute(service: MonitoredService): Promise<MonitoredService> {
    await this.dependencies.repository.saveMonitoredService(service);

    return service;
  }
}
