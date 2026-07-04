export type RuntimeEnvironment = "development" | "test" | "production";

export interface AppConfig {
  readonly environment: RuntimeEnvironment;
  readonly sqlite: SqliteConfig;
  readonly fileStorage: FileStorageConfig;
  readonly telegram: TelegramConfig;
}

export interface SqliteConfig {
  readonly databasePath: string;
}

export interface FileStorageConfig {
  readonly rootDirectory: string;
}

export interface TelegramConfig {
  readonly botToken?: string;
  readonly ownerUserId?: string;
  readonly pollingTimeoutSeconds: number;
}

export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  return {
    environment: parseEnvironment(env.NODE_ENV),
    sqlite: {
      databasePath: env.DOZERCLAW_DB_PATH ?? "data/dozerclaw.sqlite"
    },
    fileStorage: {
      rootDirectory: env.DOZERCLAW_FILE_STORAGE_ROOT ?? "data/file-inbox"
    },
    telegram: {
      ...(env.DOZERCLAW_TELEGRAM_BOT_TOKEN
        ? { botToken: env.DOZERCLAW_TELEGRAM_BOT_TOKEN }
        : {}),
      ...(env.DOZERCLAW_TELEGRAM_OWNER_USER_ID
        ? { ownerUserId: env.DOZERCLAW_TELEGRAM_OWNER_USER_ID }
        : {}),
      pollingTimeoutSeconds: parsePositiveInteger(
        env.DOZERCLAW_TELEGRAM_POLL_TIMEOUT_SECONDS,
        30
      )
    }
  };
}

function parseEnvironment(value: string | undefined): RuntimeEnvironment {
  if (value === "production" || value === "test") {
    return value;
  }

  return "development";
}

function parsePositiveInteger(
  value: string | undefined,
  fallback: number
): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
