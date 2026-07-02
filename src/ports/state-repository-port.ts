export interface StateRepositoryPort {
  healthCheck(): Promise<StateRepositoryHealth>;
}

export interface StateRepositoryHealth {
  readonly ok: boolean;
  readonly detail?: string;
}
