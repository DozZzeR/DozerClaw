import type { MonitoredService } from "../core/domain/service-health/monitored-service.js";

export interface ServiceRegistryRepositoryPort {
  saveMonitoredService(service: MonitoredService): Promise<void>;
  listEnabledMonitoredServices(): Promise<readonly MonitoredService[]>;
}
