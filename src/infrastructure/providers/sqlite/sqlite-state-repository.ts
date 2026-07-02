import type { StateRepositoryPort } from "../../../ports/state-repository-port.js";
import type { SqliteDatabase } from "./sqlite-database.js";

export class SqliteStateRepository implements StateRepositoryPort {
  constructor(private readonly database: SqliteDatabase) {}

  async healthCheck() {
    try {
      this.database.prepare("select 1").get();

      return {
        ok: true,
        detail: "SQLite reachable"
      };
    } catch (error) {
      return {
        ok: false,
        detail: error instanceof Error ? error.message : "SQLite unreachable"
      };
    }
  }
}
