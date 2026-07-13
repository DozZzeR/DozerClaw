import { pathToFileURL } from "node:url";

import { loadConfig } from "../../composition/config.js";
import { normalizeSubjectId } from "../../core/domain/family-memory/subject-id.js";
import { createSqliteDatabase } from "../../infrastructure/providers/sqlite/sqlite-database.js";
import { SqliteSubjectAliasRepository } from "../../infrastructure/providers/sqlite/sqlite-subject-alias-repository.js";

export interface DevDeleteSubjectAliasOptions {
  readonly env: NodeJS.ProcessEnv;
  readonly write: (line: string) => void;
}

export async function runDevDeleteSubjectAlias(
  options: DevDeleteSubjectAliasOptions
): Promise<number> {
  if (options.env.NODE_ENV === "production") {
    options.write("dev subject alias deletion is not available in production.");

    return 1;
  }

  const aliasSubjectId = normalizeSubjectId(
    options.env.DOZERCLAW_DEV_SUBJECT_ALIAS
  );

  if (!aliasSubjectId) {
    options.write("DOZERCLAW_DEV_SUBJECT_ALIAS is required.");

    return 1;
  }

  const config = loadConfig(options.env);
  const database = createSqliteDatabase({ path: config.sqlite.databasePath });
  const repository = new SqliteSubjectAliasRepository(database);

  try {
    const deleted = await repository.deleteSubjectAlias(aliasSubjectId);

    options.write(
      deleted
        ? `deleted subject alias: ${aliasSubjectId}`
        : `subject alias not found: ${aliasSubjectId}`
    );

    return 0;
  } finally {
    database.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const exitCode = await runDevDeleteSubjectAlias({
    env: process.env,
    write(line) {
      console.log(line);
    }
  });

  process.exitCode = exitCode;
}
