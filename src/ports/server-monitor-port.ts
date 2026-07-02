export interface ServerMonitorPort {
  getHostHealth(): Promise<HostHealthSnapshot>;
}

export interface HostHealthSnapshot {
  readonly checkedAt: Date;
  readonly uptimeSeconds: number;
  readonly loadAverage: readonly number[];
  readonly memory: {
    readonly totalBytes: number;
    readonly freeBytes: number;
  };
}
