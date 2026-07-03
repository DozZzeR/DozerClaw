export type ServiceHealthSourceKind = "manual" | "local_path";

export interface LocalPathServiceHealthSourceConfig {
  readonly path: string;
}

export type ServiceHealthSourceConfig = LocalPathServiceHealthSourceConfig;

export interface MonitoredService {
  readonly id: string;
  readonly name: string;
  readonly healthSourceKind: ServiceHealthSourceKind;
  readonly healthSourceConfig?: ServiceHealthSourceConfig;
  readonly enabled: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
