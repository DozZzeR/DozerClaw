export interface PlanningPort {
  queryPlanningState(query: PlanningQuery): Promise<PlanningQueryResult>;
  createPlanningTask?(input: PlanningTaskCreate): Promise<PlanningTaskMutationResult>;
  completePlanningTask?(input: PlanningTaskComplete): Promise<PlanningTaskMutationResult>;
}

export type PlanningScope = "family" | "personal";

export interface PlanningQuery {
  readonly text: string;
  readonly scope: PlanningScope;
  readonly startDateFrom?: string;
  readonly startDateTo?: string;
}

export interface PlanningQueryResult {
  readonly items: readonly PlanningItem[];
}

export interface PlanningItem {
  readonly id: string;
  readonly title: string;
  readonly status: string;
}

export interface PlanningTaskCreate {
  readonly title: string;
  readonly scope: PlanningScope;
  readonly date?: string;
  readonly checklistItems?: readonly string[];
}

export interface PlanningTaskComplete {
  readonly taskId: string;
  readonly scope: PlanningScope;
  readonly completedAt: Date;
}

export interface PlanningTaskMutationResult {
  readonly item: PlanningItem;
}
