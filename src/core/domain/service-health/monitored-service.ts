export type ServiceHealthSourceKind = "manual";

export interface MonitoredService {
  readonly id: string;
  readonly name: string;
  readonly healthSourceKind: ServiceHealthSourceKind;
  readonly enabled: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
