import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { runDevListSubjectAliases } from "../../../src/entrypoints/cli/dev-list-subject-aliases.js";
import { createSqliteDatabase } from "../../../src/infrastructure/providers/sqlite/sqlite-database.js";
import { SqliteSubjectAliasRepository } from "../../../src/infrastructure/providers/sqlite/sqlite-subject-alias-repository.js";

describe("runDevListSubjectAliases", () => {
  it("blocks production", async () => {
    const lines: string[] = [];

    const exitCode = await runDevListSubjectAliases({
      env: {
        NODE_ENV: "production"
      },
      write(line) {
        lines.push(line);
      }
    });

    expect(exitCode).toBe(1);
    expect(lines).toEqual([
      "dev subject alias listing is not available in production."
    ]);
  });

  it("prints an empty state when no aliases exist", async () => {
    const directory = mkdtempSync(join(tmpdir(), "dozerclaw-subject-alias-"));
    const databasePath = join(directory, "dozerclaw.sqlite");
    const lines: string[] = [];

    try {
      const exitCode = await runDevListSubjectAliases({
        env: {
          NODE_ENV: "test",
          DOZERCLAW_DB_PATH: databasePath
        },
        write(line) {
          lines.push(line);
        }
      });

      expect(exitCode).toBe(0);
      expect(lines).toEqual(["subject aliases: none"]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("prints subject aliases", async () => {
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
      await repository.saveSubjectAlias({
        aliasSubjectId: "alexey",
        canonicalSubjectId: "alex"
      });
      database.close();

      const exitCode = await runDevListSubjectAliases({
        env: {
          NODE_ENV: "test",
          DOZERCLAW_DB_PATH: databasePath
        },
        write(line) {
          lines.push(line);
        }
      });

      expect(exitCode).toBe(0);
      expect(lines).toEqual([
        "subject aliases:",
        "- alexey -> alex",
        "- maksim -> max"
      ]);
    } finally {
      if (database.open) {
        database.close();
      }
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
