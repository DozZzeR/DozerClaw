export interface NotificationDeliveryTarget {
  readonly actorId: string;
  readonly provider: string;
  readonly providerChatId: string;
}

export interface NotificationDeliveryPort {
  send(input: {
    readonly provider: string;
    readonly providerChatId: string;
    readonly text: string;
  }): Promise<void>;
}
