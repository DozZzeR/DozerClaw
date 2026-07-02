import { describe, expect, it } from "vitest";

import { createSqliteDatabase } from "../../../src/infrastructure/providers/sqlite/sqlite-database.js";
import { SqliteStateRepository } from "../../../src/infrastructure/providers/sqlite/sqlite-state-repository.js";

describe("SqliteStateRepository", () => {
  it("reports SQLite reachability", async () => {
    const database = createSqliteDatabase({ path: ":memory:" });
    const repository = new SqliteStateRepository(database);

    await expect(repository.healthCheck()).resolves.toEqual({
      ok: true,
      detail: "SQLite reachable"
    });

    database.close();
  });
});
