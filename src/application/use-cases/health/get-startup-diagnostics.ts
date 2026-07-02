import type { StartupDiagnostic } from "../../../core/domain/diagnostics/startup-diagnostic.js";

export interface StartupDiagnosticsSource {
  getStartupDiagnostics(): readonly StartupDiagnostic[];
}

export function getStartupDiagnostics(
  source: StartupDiagnosticsSource
): readonly StartupDiagnostic[] {
  return source.getStartupDiagnostics();
}
