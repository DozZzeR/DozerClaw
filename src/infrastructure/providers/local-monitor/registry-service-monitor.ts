import { stat } from "node:fs/promises";

import type { MonitoredService } from "../../../core/domain/service-health/monitored-service.js";
import type {
  ServiceHealthSnapshot,
  ServiceMonitorPort
} from "../../../ports/service-monitor-port.js";
import type { ServiceRegistryRepositoryPort } from "../../../ports/service-registry-repository-port.js";

export interface RegistryServiceMonitorOptions {
  readonly repository: ServiceRegistryRepositoryPort;
  readonly pathExists?: (path: string) => Promise<boolean>;
  readonly httpRequest?: (
    url: string,
    options: HttpHealthRequestOptions
  ) => Promise<HttpHealthResponse>;
  readonly now?: () => Date;
}

export interface HttpHealthRequestOptions {
  readonly timeoutMs: number;
}

export interface HttpHealthResponse {
  readonly status: number;
}

export class RegistryServiceMonitor implements ServiceMonitorPort {
  private static readonly defaultHttpTimeoutMs = 3000;

  private readonly now: () => Date;
  private readonly pathExists: (path: string) => Promise<boolean>;
  private readonly httpRequest: (
    url: string,
    options: HttpHealthRequestOptions
  ) => Promise<HttpHealthResponse>;

  constructor(private readonly options: RegistryServiceMonitorOptions) {
    this.now = options.now ?? (() => new Date());
    this.pathExists = options.pathExists ?? defaultPathExists;
    this.httpRequest = options.httpRequest ?? defaultHttpRequest;
  }

  async listServiceHealth(): Promise<readonly ServiceHealthSnapshot[]> {
    const services = await this.options.repository.listEnabledMonitoredServices();

    return Promise.all(services.map((service) => this.inspectService(service)));
  }

  private async inspectService(
    service: MonitoredService
  ): Promise<ServiceHealthSnapshot> {
    if (service.healthSourceKind === "local_path") {
      const path = service.healthSourceConfig?.path;

      if (!path) {
        return {
          name: service.name,
          status: "failed",
          detail: "local_path service missing path config",
          checkedAt: this.now()
        };
      }

      const exists = await this.pathExists(path);

      return {
        name: service.name,
        status: exists ? "ok" : "failed",
        detail: exists ? `path exists: ${path}` : `path missing: ${path}`,
        checkedAt: this.now()
      };
    }

    if (service.healthSourceKind === "http_health") {
      const url = service.healthSourceConfig?.url;

      if (!url) {
        return {
          name: service.name,
          status: "failed",
          detail: "http_health service missing url config",
          checkedAt: this.now()
        };
      }

      try {
        const response = await this.httpRequest(url, {
          timeoutMs:
            service.healthSourceConfig?.timeoutMs ??
            RegistryServiceMonitor.defaultHttpTimeoutMs
        });
        const ok = response.status >= 200 && response.status < 300;

        return {
          name: service.name,
          status: ok ? "ok" : "failed",
          detail: `HTTP ${response.status}: ${url}`,
          checkedAt: this.now()
        };
      } catch (error) {
        return {
          name: service.name,
          status: "failed",
          detail: `HTTP request failed: ${
            error instanceof Error ? error.message : "request failed"
          }`,
          checkedAt: this.now()
        };
      }
    }

    return {
      name: service.name,
      status: "unknown",
      detail: "manual service has no automatic check",
      checkedAt: this.now()
    };
  }
}

async function defaultPathExists(path: string): Promise<boolean> {
  try {
    await stat(path);

    return true;
  } catch {
    return false;
  }
}

async function defaultHttpRequest(
  url: string,
  options: HttpHealthRequestOptions
): Promise<HttpHealthResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal
    });

    return {
      status: response.status
    };
  } finally {
    clearTimeout(timeout);
  }
}
