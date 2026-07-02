export type RuntimeEnvironment = "development" | "test" | "production";

export interface AppConfig {
  readonly environment: RuntimeEnvironment;
}

export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  return {
    environment: parseEnvironment(env.NODE_ENV)
  };
}

function parseEnvironment(value: string | undefined): RuntimeEnvironment {
  if (value === "production" || value === "test") {
    return value;
  }

  return "development";
}
