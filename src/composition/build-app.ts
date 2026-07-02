import type { DozerClawApp } from "./app.js";
import { loadConfig } from "./config.js";

export function buildApp(): DozerClawApp {
  const config = loadConfig(process.env);

  return {
    getStartupDiagnostics() {
      return [
        {
          name: "composition",
          status: "ok",
          detail: "DozerClaw composition root initialized"
        },
        {
          name: "environment",
          status: config.environment === "production" ? "ok" : "degraded",
          detail: `environment=${config.environment}`
        }
      ];
    }
  };
}
