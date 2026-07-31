export type NotificationScope = "family" | "personal";

export interface Notification {
  readonly id: string;
  readonly scope: NotificationScope;
  readonly title: string;
  readonly body: string;
  readonly sourceKind?: string;
  readonly sourceId?: string;
  readonly createdByActorId?: string;
  readonly createdAt: Date;
}
