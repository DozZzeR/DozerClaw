import { pathToFileURL } from "node:url";

import { RegisterMonitoredServiceUseCase } from "../../application/use-cases/service-health/register-monitored-service.js";
import type { MonitoredService } from "../../core/domain/service-health/monitored-service.js";
import { loadConfig } from "../../composition/config.js";
import { createSqliteDatabase } from "../../infrastructure/providers/sqlite/sqlite-database.js";
import { SqliteServiceRegistryRepository } from "../../infrastructure/providers/sqlite/sqlite-service-registry-repository.js";

export interface DevRegisterServicesOptions {
  readonly env: NodeJS.ProcessEnv;
  readonly write: (line: string) => void;
}

export async function runDevRegisterServices(
  options: DevRegisterServicesOptions
): Promise<number> {
  if (options.env.NODE_ENV === "production") {
    options.write("dev service registration is not available in production.");

    return 1;
  }

  const config = loadConfig(options.env);
  const database = createSqliteDatabase({ path: config.sqlite.databasePath });
  const repository = new SqliteServiceRegistryRepository(database);
  const registerService = new RegisterMonitoredServiceUseCase({ repository });
  const now = new Date();

  try {
    for (const service of buildDefaultServices(options.env, now)) {
      await registerService.execute(service);
      options.write(
        `registered service: ${service.name} -> ${service.healthSourceConfig.url}`
      );
    }
  } finally {
    database.close();
  }

  return 0;
}

function buildDefaultServices(
  env: NodeJS.ProcessEnv,
  now: Date
): readonly HttpHealthMonitoredService[] {
  const timeoutMs = parseTimeoutMs(env.DOZERCLAW_SERVICE_HEALTH_TIMEOUT_MS);

  return [
    {
      id: "service-taskframe",
      name: "taskframe",
      healthSourceKind: "http_health",
      healthSourceConfig: {
        url:
          env.DOZERCLAW_TASKFRAME_HEALTH_URL ??
          "http://127.0.0.1:3000/health",
        ...(timeoutMs ? { timeoutMs } : {})
      },
      enabled: true,
      createdAt: now,
      updatedAt: now
    },
    {
      id: "service-mempalace-http",
      name: "mempalace-http",
      healthSourceKind: "http_health",
      healthSourceConfig: {
        url:
          env.DOZERCLAW_MEMPALACE_HTTP_HEALTH_URL ??
          "http://127.0.0.1:4118/healthz",
        ...(timeoutMs ? { timeoutMs } : {})
      },
      enabled: true,
      createdAt: now,
      updatedAt: now
    }
  ];
}

type HttpHealthMonitoredService = Extract<
  MonitoredService,
  { readonly healthSourceKind: "http_health" }
>;

function parseTimeoutMs(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return Math.floor(parsed);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const exitCode = await runDevRegisterServices({
    env: process.env,
    write(line) {
      console.log(line);
    }
  });

  process.exitCode = exitCode;
}
