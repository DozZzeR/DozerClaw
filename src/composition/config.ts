export type RuntimeEnvironment = "development" | "test" | "production";

export interface AppConfig {
  readonly environment: RuntimeEnvironment;
  readonly sqlite: SqliteConfig;
}

export interface SqliteConfig {
  readonly databasePath: string;
}

export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  return {
    environment: parseEnvironment(env.NODE_ENV),
    sqlite: {
      databasePath: env.DOZERCLAW_DB_PATH ?? "data/dozerclaw.sqlite"
    }
  };
}

function parseEnvironment(value: string | undefined): RuntimeEnvironment {
  if (value === "production" || value === "test") {
    return value;
  }

  return "development";
}
