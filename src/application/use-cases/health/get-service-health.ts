import type {
  ServiceHealthSnapshot,
  ServiceMonitorPort
} from "../../../ports/service-monitor-port.js";

export interface GetServiceHealthDependencies {
  readonly serviceMonitor: ServiceMonitorPort;
}

export class GetServiceHealthUseCase {
  constructor(private readonly dependencies: GetServiceHealthDependencies) {}

  execute(): Promise<readonly ServiceHealthSnapshot[]> {
    return this.dependencies.serviceMonitor.listServiceHealth();
  }
}
