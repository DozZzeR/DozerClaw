import type { Actor } from "../../../core/domain/identity/actor.js";
import type { ChatContext, ChatContextKind } from "../../../core/domain/identity/chat-context.js";
import type { IdentityAccessRepositoryPort } from "../../../ports/identity-access-repository-port.js";

export interface ResolveIdentityContextInput {
  readonly provider: string;
  readonly providerUserId: string;
  readonly providerChatId: string;
  readonly chatKind: ChatContextKind;
  readonly displayName: string;
}

export interface ResolveIdentityContextResult {
  readonly actor: Actor;
  readonly chat: ChatContext;
  readonly createdActor: boolean;
  readonly createdChat: boolean;
}

export interface ResolveIdentityContextDependencies {
  readonly repository: IdentityAccessRepositoryPort;
  readonly generateId: () => string;
}

export class ResolveIdentityContextUseCase {
  constructor(private readonly dependencies: ResolveIdentityContextDependencies) {}

  async execute(
    input: ResolveIdentityContextInput
  ): Promise<ResolveIdentityContextResult> {
    const existingActor = await this.dependencies.repository.findActorByIdentity(
      input.provider,
      input.providerUserId
    );
    const existingChat =
      await this.dependencies.repository.findChatByProviderChatId(
        input.provider,
        input.providerChatId
      );

    const actor =
      existingActor ??
      (await this.createPendingActorAndIdentity(input));
    const chat =
      existingChat ??
      (await this.createUnapprovedChat(input));

    return {
      actor,
      chat,
      createdActor: !existingActor,
      createdChat: !existingChat
    };
  }

  private async createPendingActorAndIdentity(
    input: ResolveIdentityContextInput
  ): Promise<Actor> {
    const actor: Actor = {
      id: this.dependencies.generateId(),
      displayName: input.displayName,
      role: "family",
      status: "pending"
    };

    await this.dependencies.repository.createActor(actor);
    await this.dependencies.repository.createActorIdentity({
      id: this.dependencies.generateId(),
      actorId: actor.id,
      provider: input.provider,
      providerUserId: input.providerUserId,
      status: "pending"
    });

    return actor;
  }

  private async createUnapprovedChat(
    input: ResolveIdentityContextInput
  ): Promise<ChatContext> {
    const chat = await this.dependencies.repository.createMessengerChat({
      id: this.dependencies.generateId(),
      provider: input.provider,
      providerChatId: input.providerChatId,
      kind: input.chatKind,
      approved: false
    });

    return {
      id: chat.id,
      kind: chat.kind,
      approved: chat.approved
    };
  }
}
