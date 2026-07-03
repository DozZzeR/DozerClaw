import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { runDevRegisterServices } from "../../../src/entrypoints/cli/dev-register-services.js";
import { createSqliteDatabase } from "../../../src/infrastructure/providers/sqlite/sqlite-database.js";
import { SqliteServiceRegistryRepository } from "../../../src/infrastructure/providers/sqlite/sqlite-service-registry-repository.js";

describe("runDevRegisterServices", () => {
  it("registers default local HTTP services", async () => {
    const lines: string[] = [];

    const exitCode = await runDevRegisterServices({
      env: {
        DOZERCLAW_DB_PATH: ":memory:",
        NODE_ENV: "test"
      },
      write(line) {
        lines.push(line);
      }
    });

    expect(exitCode).toBe(0);
    expect(lines).toEqual([
      "registered service: taskframe -> http://127.0.0.1:4120/health",
      "registered service: mempalace-http -> http://127.0.0.1:4118/healthz"
    ]);
  });

  it("persists registered services in the configured database", async () => {
    const directory = mkdtempSync(join(tmpdir(), "dozerclaw-test-"));
    const databasePath = join(directory, "dozerclaw.sqlite");

    try {
      await runDevRegisterServices({
        env: {
          DOZERCLAW_DB_PATH: databasePath,
          NODE_ENV: "test",
          DOZERCLAW_TASKFRAME_HEALTH_URL: "http://taskframe.local/health",
          DOZERCLAW_MEMPALACE_HTTP_HEALTH_URL: "http://mempalace.local/healthz",
          DOZERCLAW_SERVICE_HEALTH_TIMEOUT_MS: "1000"
        },
        write() {}
      });

      const readDatabase = createSqliteDatabase({ path: databasePath });
      const repository = new SqliteServiceRegistryRepository(readDatabase);

      await expect(repository.listEnabledMonitoredServices()).resolves.toEqual([
        expect.objectContaining({
          id: "service-mempalace-http",
          name: "mempalace-http",
          healthSourceKind: "http_health",
          healthSourceConfig: {
            url: "http://mempalace.local/healthz",
            timeoutMs: 1000
          }
        }),
        expect.objectContaining({
          id: "service-taskframe",
          name: "taskframe",
          healthSourceKind: "http_health",
          healthSourceConfig: {
            url: "http://taskframe.local/health",
            timeoutMs: 1000
          }
        })
      ]);

      readDatabase.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("blocks production", async () => {
    const lines: string[] = [];

    const exitCode = await runDevRegisterServices({
      env: {
        NODE_ENV: "production"
      },
      write(line) {
        lines.push(line);
      }
    });

    expect(exitCode).toBe(1);
    expect(lines).toEqual([
      "dev service registration is not available in production."
    ]);
  });
});
