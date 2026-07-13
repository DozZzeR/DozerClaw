import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { runDevSubjectAlias } from "../../../src/entrypoints/cli/dev-subject-alias.js";
import { RecordFamilyFactUseCase } from "../../../src/application/use-cases/family-memory/record-family-fact.js";
import { createSqliteDatabase } from "../../../src/infrastructure/providers/sqlite/sqlite-database.js";
import { SqliteFamilyMemoryRepository } from "../../../src/infrastructure/providers/sqlite/sqlite-family-memory-repository.js";
import { SqliteSubjectAliasRepository } from "../../../src/infrastructure/providers/sqlite/sqlite-subject-alias-repository.js";

describe("runDevSubjectAlias", () => {
  it("blocks production", async () => {
    const lines: string[] = [];

    const exitCode = await runDevSubjectAlias({
      env: {
        NODE_ENV: "production",
        DOZERCLAW_DEV_SUBJECT_ALIAS: "Maksim",
        DOZERCLAW_DEV_SUBJECT_CANONICAL: "max"
      },
      write(line) {
        lines.push(line);
      }
    });

    expect(exitCode).toBe(1);
    expect(lines).toEqual([
      "dev subject alias registration is not available in production."
    ]);
  });

  it("requires alias and canonical subject ids", async () => {
    const lines: string[] = [];

    const exitCode = await runDevSubjectAlias({
      env: {
        NODE_ENV: "test"
      },
      write(line) {
        lines.push(line);
      }
    });

    expect(exitCode).toBe(1);
    expect(lines).toEqual([
      "DOZERCLAW_DEV_SUBJECT_ALIAS and DOZERCLAW_DEV_SUBJECT_CANONICAL are required."
    ]);
  });

  it("stores a normalized subject alias", async () => {
    const directory = mkdtempSync(join(tmpdir(), "dozerclaw-subject-alias-"));
    const databasePath = join(directory, "dozerclaw.sqlite");
    const lines: string[] = [];

    try {
      const exitCode = await runDevSubjectAlias({
        env: {
          NODE_ENV: "test",
          DOZERCLAW_DB_PATH: databasePath,
          DOZERCLAW_DEV_SUBJECT_ALIAS: " Person: Maksim ",
          DOZERCLAW_DEV_SUBJECT_CANONICAL: " Max "
        },
        write(line) {
          lines.push(line);
        }
      });

      expect(exitCode).toBe(0);
      expect(lines).toEqual(["registered subject alias: maksim -> max"]);

      const database = createSqliteDatabase({ path: databasePath });
      const subjectAliases = new SqliteSubjectAliasRepository(database);

      await expect(subjectAliases.resolveCanonicalSubjectId("maksim")).resolves.toBe(
        "max"
      );

      const familyMemory = new SqliteFamilyMemoryRepository(database);
      const recorder = new RecordFamilyFactUseCase({
        repository: familyMemory,
        subjectAliases,
        generateId: () => "fact-1",
        now: () => new Date("2026-07-07T10:00:00.000Z")
      });

      await recorder.execute({
        summary: "Maksim started swimming lessons.",
        category: "event",
        subjectId: "Maksim",
        sourceActorId: "actor-owner",
        sourceChatId: "chat-family",
        sourceMessageText: "remember Maksim started swimming lessons"
      });

      await expect(familyMemory.listRecentActiveFamilyFacts(1)).resolves.toEqual([
        expect.objectContaining({
          id: "fact-1",
          subjectId: "max"
        })
      ]);
      database.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
