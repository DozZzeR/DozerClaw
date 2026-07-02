export type DiagnosticStatus = "ok" | "degraded" | "failed";

export interface StartupDiagnostic {
  readonly name: string;
  readonly status: DiagnosticStatus;
  readonly detail?: string;
}
