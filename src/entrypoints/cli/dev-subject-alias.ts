import { pathToFileURL } from "node:url";

import { loadConfig } from "../../composition/config.js";
import { normalizeSubjectId } from "../../core/domain/family-memory/subject-id.js";
import { createSqliteDatabase } from "../../infrastructure/providers/sqlite/sqlite-database.js";
import { SqliteSubjectAliasRepository } from "../../infrastructure/providers/sqlite/sqlite-subject-alias-repository.js";

export interface DevSubjectAliasOptions {
  readonly env: NodeJS.ProcessEnv;
  readonly write: (line: string) => void;
}

export async function runDevSubjectAlias(
  options: DevSubjectAliasOptions
): Promise<number> {
  if (options.env.NODE_ENV === "production") {
    options.write(
      "dev subject alias registration is not available in production."
    );

    return 1;
  }

  const aliasSubjectId = normalizeSubjectId(
    options.env.DOZERCLAW_DEV_SUBJECT_ALIAS
  );
  const canonicalSubjectId = normalizeSubjectId(
    options.env.DOZERCLAW_DEV_SUBJECT_CANONICAL
  );

  if (!aliasSubjectId || !canonicalSubjectId) {
    options.write(
      "DOZERCLAW_DEV_SUBJECT_ALIAS and DOZERCLAW_DEV_SUBJECT_CANONICAL are required."
    );

    return 1;
  }

  const config = loadConfig(options.env);
  const database = createSqliteDatabase({ path: config.sqlite.databasePath });
  const repository = new SqliteSubjectAliasRepository(database);

  try {
    await repository.saveSubjectAlias({
      aliasSubjectId,
      canonicalSubjectId
    });
    options.write(
      `registered subject alias: ${aliasSubjectId} -> ${canonicalSubjectId}`
    );

    return 0;
  } finally {
    database.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const exitCode = await runDevSubjectAlias({
    env: process.env,
    write(line) {
      console.log(line);
    }
  });

  process.exitCode = exitCode;
}
