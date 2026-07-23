export interface PlanningPort {
  queryPlanningState(query: PlanningQuery): Promise<PlanningQueryResult>;
}

export type PlanningScope = "family" | "personal";

export interface PlanningQuery {
  readonly text: string;
  readonly scope: PlanningScope;
}

export interface PlanningQueryResult {
  readonly items: readonly PlanningItem[];
}

export interface PlanningItem {
  readonly id: string;
  readonly title: string;
  readonly status: string;
}
