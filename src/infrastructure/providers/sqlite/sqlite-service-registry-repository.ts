import type { MonitoredService } from "../../../core/domain/service-health/monitored-service.js";
import type { ServiceRegistryRepositoryPort } from "../../../ports/service-registry-repository-port.js";
import type { SqliteDatabase } from "./sqlite-database.js";

interface MonitoredServiceRow {
  readonly id: string;
  readonly name: string;
  readonly health_source_kind: MonitoredService["healthSourceKind"];
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
            enabled,
            created_at,
            updated_at
          )
          values (@id, @name, @healthSourceKind, @enabled, @createdAt, @updatedAt)
        `
      )
      .run({
        id: service.id,
        name: service.name,
        healthSourceKind: service.healthSourceKind,
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
  return {
    id: row.id,
    name: row.name,
    healthSourceKind: row.health_source_kind,
    enabled: row.enabled === 1,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  };
}
