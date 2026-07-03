export type ServiceHealthSourceKind = "manual" | "local_path" | "http_health";

interface MonitoredServiceBase {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface LocalPathServiceHealthSourceConfig {
  readonly path: string;
}

export interface HttpHealthServiceHealthSourceConfig {
  readonly url: string;
  readonly timeoutMs?: number;
}

export type ServiceHealthSourceConfig =
  | LocalPathServiceHealthSourceConfig
  | HttpHealthServiceHealthSourceConfig;

export type MonitoredService =
  | (MonitoredServiceBase & {
      readonly healthSourceKind: "manual";
      readonly healthSourceConfig?: undefined;
    })
  | (MonitoredServiceBase & {
      readonly healthSourceKind: "local_path";
      readonly healthSourceConfig: LocalPathServiceHealthSourceConfig;
    })
  | (MonitoredServiceBase & {
      readonly healthSourceKind: "http_health";
      readonly healthSourceConfig: HttpHealthServiceHealthSourceConfig;
    });
