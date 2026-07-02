import type { StartupDiagnostic } from "../core/domain/diagnostics/startup-diagnostic.js";

export interface DozerClawApp {
  getStartupDiagnostics(): readonly StartupDiagnostic[];
}
