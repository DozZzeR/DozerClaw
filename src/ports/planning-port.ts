export interface PlanningPort {
  queryPlanningState(query: PlanningQuery): Promise<PlanningQueryResult>;
}

export interface PlanningQuery {
  readonly text: string;
}

export interface PlanningQueryResult {
  readonly items: readonly PlanningItem[];
}

export interface PlanningItem {
  readonly id: string;
  readonly title: string;
  readonly status: string;
}
