import type {
  ServiceHealthSnapshot,
  ServiceMonitorPort
} from "../../../ports/service-monitor-port.js";

export interface LocalServiceCheck {
  readonly name: string;
  readonly check: () => Promise<LocalServiceCheckResult>;
}

export interface LocalServiceCheckResult {
  readonly status: ServiceHealthSnapshot["status"];
  readonly detail?: string;
}

export interface LocalServiceMonitorOptions {
  readonly checks?: readonly LocalServiceCheck[];
  readonly now?: () => Date;
}

export class LocalServiceMonitor implements ServiceMonitorPort {
  private readonly checks: readonly LocalServiceCheck[];
  private readonly now: () => Date;

  constructor(options: LocalServiceMonitorOptions = {}) {
    this.checks = options.checks ?? [];
    this.now = options.now ?? (() => new Date());
  }

  async listServiceHealth(): Promise<readonly ServiceHealthSnapshot[]> {
    return Promise.all(
      this.checks.map(async (serviceCheck) => {
        try {
          const result = await serviceCheck.check();

          return {
            name: serviceCheck.name,
            status: result.status,
            ...(result.detail ? { detail: result.detail } : {}),
            checkedAt: this.now()
          };
        } catch (error) {
          return {
            name: serviceCheck.name,
            status: "failed",
            detail: error instanceof Error ? error.message : "check failed",
            checkedAt: this.now()
          };
        }
      })
    );
  }
}
