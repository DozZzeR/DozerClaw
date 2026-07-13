import { pathToFileURL } from "node:url";

import { loadConfig } from "../../composition/config.js";
import { createSqliteDatabase } from "../../infrastructure/providers/sqlite/sqlite-database.js";
import { SqliteSubjectAliasRepository } from "../../infrastructure/providers/sqlite/sqlite-subject-alias-repository.js";

export interface DevListSubjectAliasesOptions {
  readonly env: NodeJS.ProcessEnv;
  readonly write: (line: string) => void;
}

export async function runDevListSubjectAliases(
  options: DevListSubjectAliasesOptions
): Promise<number> {
  if (options.env.NODE_ENV === "production") {
    options.write("dev subject alias listing is not available in production.");

    return 1;
  }

  const config = loadConfig(options.env);
  const database = createSqliteDatabase({ path: config.sqlite.databasePath });
  const repository = new SqliteSubjectAliasRepository(database);

  try {
    const aliases = await repository.listSubjectAliases();

    if (aliases.length === 0) {
      options.write("subject aliases: none");

      return 0;
    }

    options.write("subject aliases:");

    for (const alias of aliases) {
      options.write(
        `- ${alias.aliasSubjectId} -> ${alias.canonicalSubjectId}`
      );
    }

    return 0;
  } finally {
    database.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const exitCode = await runDevListSubjectAliases({
    env: process.env,
    write(line) {
      console.log(line);
    }
  });

  process.exitCode = exitCode;
}
