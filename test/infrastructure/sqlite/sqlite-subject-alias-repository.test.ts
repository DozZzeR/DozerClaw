import { describe, expect, it } from "vitest";

import { createSqliteDatabase } from "../../../src/infrastructure/providers/sqlite/sqlite-database.js";
import { SqliteSubjectAliasRepository } from "../../../src/infrastructure/providers/sqlite/sqlite-subject-alias-repository.js";

describe("SqliteSubjectAliasRepository", () => {
  it("saves and resolves subject aliases", async () => {
    const database = createSqliteDatabase({ path: ":memory:" });
    const repository = new SqliteSubjectAliasRepository(database);

    try {
      await repository.saveSubjectAlias({
        aliasSubjectId: "maksim",
        canonicalSubjectId: "max"
      });

      await expect(repository.resolveCanonicalSubjectId("maksim")).resolves.toBe(
        "max"
      );
      await expect(repository.resolveCanonicalSubjectId("max")).resolves.toBe(
        "max"
      );
    } finally {
      database.close();
    }
  });
});
