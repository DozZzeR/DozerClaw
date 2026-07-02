import type { DozerClawApp } from "./app.js";
import { loadConfig } from "./config.js";
import type { StartupDiagnostic } from "../core/domain/diagnostics/startup-diagnostic.js";
import { createSqliteDatabase } from "../infrastructure/providers/sqlite/sqlite-database.js";
import { SqliteEventLog } from "../infrastructure/providers/sqlite/sqlite-event-log.js";
import { SqliteStateRepository } from "../infrastructure/providers/sqlite/sqlite-state-repository.js";

export interface BuildAppOptions {
  readonly env?: NodeJS.ProcessEnv;
}

export function buildApp(options: BuildAppOptions = {}): DozerClawApp {
  const config = loadConfig(options.env ?? process.env);
  const database = createSqliteDatabase({ path: config.sqlite.databasePath });
  const stateRepository = new SqliteStateRepository(database);
  const eventLog = new SqliteEventLog(database);

  return {
    async getStartupDiagnostics() {
      const stateRepositoryHealth = await stateRepository.healthCheck();
      const eventLogHealth = await eventLog.healthCheck();

      return [
        {
          name: "composition",
          status: "ok",
          detail: "DozerClaw composition root initialized"
        },
        {
          name: "environment",
          status: config.environment === "production" ? "ok" : "degraded",
          detail: `environment=${config.environment}`
        },
        healthToDiagnostic(
          "state_repository",
          stateRepositoryHealth.ok,
          stateRepositoryHealth.detail
        ),
        healthToDiagnostic("event_log", eventLogHealth.ok, eventLogHealth.detail)
      ];
    }
  };
}

function healthToDiagnostic(
  name: string,
  ok: boolean,
  detail: string | undefined
): StartupDiagnostic {
  return {
    name,
    status: ok ? "ok" : "failed",
    ...(detail ? { detail } : {})
  };
}
