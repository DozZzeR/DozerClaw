export interface ServiceMonitorPort {
  listServiceHealth(): Promise<readonly ServiceHealthSnapshot[]>;
}

export interface ServiceHealthSnapshot {
  readonly name: string;
  readonly status: "ok" | "degraded" | "failed" | "unknown";
  readonly detail?: string;
  readonly checkedAt: Date;
}
