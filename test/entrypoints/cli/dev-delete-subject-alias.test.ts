import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { runDevDeleteSubjectAlias } from "../../../src/entrypoints/cli/dev-delete-subject-alias.js";
import { createSqliteDatabase } from "../../../src/infrastructure/providers/sqlite/sqlite-database.js";
import { SqliteSubjectAliasRepository } from "../../../src/infrastructure/providers/sqlite/sqlite-subject-alias-repository.js";

describe("runDevDeleteSubjectAlias", () => {
  it("blocks production", async () => {
    const lines: string[] = [];

    const exitCode = await runDevDeleteSubjectAlias({
      env: {
        NODE_ENV: "production",
        DOZERCLAW_DEV_SUBJECT_ALIAS: "Maksim"
      },
      write(line) {
        lines.push(line);
      }
    });

    expect(exitCode).toBe(1);
    expect(lines).toEqual([
      "dev subject alias deletion is not available in production."
    ]);
  });

  it("requires alias input", async () => {
    const lines: string[] = [];

    const exitCode = await runDevDeleteSubjectAlias({
      env: {
        NODE_ENV: "test"
      },
      write(line) {
        lines.push(line);
      }
    });

    expect(exitCode).toBe(1);
    expect(lines).toEqual(["DOZERCLAW_DEV_SUBJECT_ALIAS is required."]);
  });

  it("deletes a normalized subject alias", async () => {
    const directory = mkdtempSync(join(tmpdir(), "dozerclaw-subject-alias-"));
    const databasePath = join(directory, "dozerclaw.sqlite");
    const database = createSqliteDatabase({ path: databasePath });
    const repository = new SqliteSubjectAliasRepository(database);
    const lines: string[] = [];

    try {
      await repository.saveSubjectAlias({
        aliasSubjectId: "maksim",
        canonicalSubjectId: "max"
      });
      database.close();

      const exitCode = await runDevDeleteSubjectAlias({
        env: {
          NODE_ENV: "test",
          DOZERCLAW_DB_PATH: databasePath,
          DOZERCLAW_DEV_SUBJECT_ALIAS: " Person: Maksim "
        },
        write(line) {
          lines.push(line);
        }
      });

      expect(exitCode).toBe(0);
      expect(lines).toEqual(["deleted subject alias: maksim"]);

      const checkDatabase = createSqliteDatabase({ path: databasePath });
      const checkRepository = new SqliteSubjectAliasRepository(checkDatabase);

      await expect(
        checkRepository.resolveCanonicalSubjectId("maksim")
      ).resolves.toBe("maksim");
      checkDatabase.close();
    } finally {
      if (database.open) {
        database.close();
      }
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("reports missing subject aliases", async () => {
    const directory = mkdtempSync(join(tmpdir(), "dozerclaw-subject-alias-"));
    const databasePath = join(directory, "dozerclaw.sqlite");
    const lines: string[] = [];

    try {
      const exitCode = await runDevDeleteSubjectAlias({
        env: {
          NODE_ENV: "test",
          DOZERCLAW_DB_PATH: databasePath,
          DOZERCLAW_DEV_SUBJECT_ALIAS: "Maksim"
        },
        write(line) {
          lines.push(line);
        }
      });

      expect(exitCode).toBe(0);
      expect(lines).toEqual(["subject alias not found: maksim"]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
