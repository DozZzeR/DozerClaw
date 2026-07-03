import type {
  HttpHealthServiceHealthSourceConfig,
  LocalPathServiceHealthSourceConfig,
  MonitoredService
} from "../../../core/domain/service-health/monitored-service.js";
import type { ServiceRegistryRepositoryPort } from "../../../ports/service-registry-repository-port.js";
import type { SqliteDatabase } from "./sqlite-database.js";

interface MonitoredServiceRow {
  readonly id: string;
  readonly name: string;
  readonly health_source_kind: MonitoredService["healthSourceKind"];
  readonly health_source_config_json: string | null;
  readonly enabled: 0 | 1;
  readonly created_at: string;
  readonly updated_at: string;
}

export class SqliteServiceRegistryRepository
  implements ServiceRegistryRepositoryPort
{
  constructor(private readonly database: SqliteDatabase) {}

  async saveMonitoredService(service: MonitoredService): Promise<void> {
    this.database
      .prepare(
        `
          insert into monitored_services (
            id,
            name,
            health_source_kind,
            health_source_config_json,
            enabled,
            created_at,
            updated_at
          )
          values (
            @id,
            @name,
            @healthSourceKind,
            @healthSourceConfigJson,
            @enabled,
            @createdAt,
            @updatedAt
          )
        `
      )
      .run({
        id: service.id,
        name: service.name,
        healthSourceKind: service.healthSourceKind,
        healthSourceConfigJson: service.healthSourceConfig
          ? JSON.stringify(service.healthSourceConfig)
          : null,
        enabled: service.enabled ? 1 : 0,
        createdAt: service.createdAt.toISOString(),
        updatedAt: service.updatedAt.toISOString()
      });
  }

  async listEnabledMonitoredServices(): Promise<readonly MonitoredService[]> {
    const rows = this.database
      .prepare(
        `
          select
            id,
            name,
            health_source_kind,
            health_source_config_json,
            enabled,
            created_at,
            updated_at
          from monitored_services
          where enabled = 1
          order by name asc
        `
      )
      .all() as MonitoredServiceRow[];

    return rows.map(toMonitoredService);
  }
}

function toMonitoredService(row: MonitoredServiceRow): MonitoredService {
  const base = {
    id: row.id,
    name: row.name,
    enabled: row.enabled === 1,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  };

  if (row.health_source_kind === "local_path") {
    return {
      ...base,
      healthSourceKind: "local_path",
      healthSourceConfig: parseLocalPathConfig(row)
    };
  }

  if (row.health_source_kind === "http_health") {
    return {
      ...base,
      healthSourceKind: "http_health",
      healthSourceConfig: parseHttpHealthConfig(row)
    };
  }

  return {
    ...base,
    healthSourceKind: "manual"
  };
}

function parseLocalPathConfig(
  row: MonitoredServiceRow
): LocalPathServiceHealthSourceConfig {
  if (!row.health_source_config_json) {
    return {
      path: ""
    };
  }

  return JSON.parse(
    row.health_source_config_json
  ) as LocalPathServiceHealthSourceConfig;
}

function parseHttpHealthConfig(
  row: MonitoredServiceRow
): HttpHealthServiceHealthSourceConfig {
  if (!row.health_source_config_json) {
    return {
      url: ""
    };
  }

  return JSON.parse(
    row.health_source_config_json
  ) as HttpHealthServiceHealthSourceConfig;
}
