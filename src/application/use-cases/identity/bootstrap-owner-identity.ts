import type { Actor } from "../../../core/domain/identity/actor.js";
import type { ChatContext } from "../../../core/domain/identity/chat-context.js";
import type { IdentityAccessRepositoryPort } from "../../../ports/identity-access-repository-port.js";

export interface BootstrapOwnerIdentityInput {
  readonly provider: string;
  readonly providerUserId: string;
  readonly providerChatId: string;
  readonly displayName: string;
}

export interface BootstrapOwnerIdentityResult {
  readonly actor: Actor;
  readonly chat: ChatContext;
  readonly createdActor: boolean;
  readonly createdIdentity: boolean;
  readonly createdChat: boolean;
}

export interface BootstrapOwnerIdentityDependencies {
  readonly repository: IdentityAccessRepositoryPort;
  readonly generateId: () => string;
}

export class BootstrapOwnerIdentityUseCase {
  constructor(
    private readonly dependencies: BootstrapOwnerIdentityDependencies
  ) {}

  async execute(
    input: BootstrapOwnerIdentityInput
  ): Promise<BootstrapOwnerIdentityResult> {
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
      existingActor ?? (await this.createOwnerActorAndIdentity(input));
    const chat = existingChat ?? (await this.createOwnerPrivateChat(input));

    return {
      actor,
      chat,
      createdActor: !existingActor,
      createdIdentity: !existingActor,
      createdChat: !existingChat
    };
  }

  private async createOwnerActorAndIdentity(
    input: BootstrapOwnerIdentityInput
  ): Promise<Actor> {
    const actor: Actor = {
      id: this.dependencies.generateId(),
      displayName: input.displayName,
      role: "owner",
      status: "active"
    };

    await this.dependencies.repository.createActor(actor);
    await this.dependencies.repository.createActorIdentity({
      id: this.dependencies.generateId(),
      actorId: actor.id,
      provider: input.provider,
      providerUserId: input.providerUserId,
      status: "active"
    });

    return actor;
  }

  private async createOwnerPrivateChat(
    input: BootstrapOwnerIdentityInput
  ): Promise<ChatContext> {
    const chat = await this.dependencies.repository.createMessengerChat({
      id: this.dependencies.generateId(),
      provider: input.provider,
      providerChatId: input.providerChatId,
      kind: "owner_private",
      approved: true
    });

    return {
      id: chat.id,
      kind: chat.kind,
      approved: chat.approved
    };
  }
}
