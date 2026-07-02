import type {
  HostHealthSnapshot,
  ServerMonitorPort
} from "../../../ports/server-monitor-port.js";

export interface GetHostHealthDependencies {
  readonly serverMonitor: ServerMonitorPort;
}

export class GetHostHealthUseCase {
  constructor(private readonly dependencies: GetHostHealthDependencies) {}

  execute(): Promise<HostHealthSnapshot> {
    return this.dependencies.serverMonitor.getHostHealth();
  }
}
