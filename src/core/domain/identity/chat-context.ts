export type ChatContextKind = "owner_private" | "family_private" | "family_group";

export interface ChatContext {
  readonly id: string;
  readonly kind: ChatContextKind;
  readonly approved: boolean;
}
