import type { OutboundReply } from "../../../../core/domain/messaging/reply.js";
import type { LastOperationContext } from "../../../../ports/state-repository-port.js";
import type { AcceptedMessageContext } from "../process-inbound-message.js";
import type { InboundIntent } from "../classify-inbound-intent.js";
import type {
  DocumentLookup,
  DocumentManager,
  DocumentRegistrar,
  PendingDocumentDecisionStore
} from "../dispatch-accepted-command.js";
import {
  documentFromLastOperation,
  formatRegisteredDocumentReply
} from "../dispatch-command-helpers.js";

const THIRTY_MINUTES_MS = 30 * 60 * 1000;

type SaveLastOperation = (
  context: AcceptedMessageContext,
  input: Pick<
    LastOperationContext,
    "operationKind" | "entityKind" | "entityId" | "entityLabel" | "document"
  >
) => Promise<void>;

export interface RegisterDocumentDependencies {
  readonly registrar?: DocumentRegistrar | undefined;
  readonly saveLastOperation: SaveLastOperation;
}

export async function handleRegisterDocument(
  context: AcceptedMessageContext,
  intent: Extract<InboundIntent, { readonly kind: "register_document" }>,
  dependencies: RegisterDocumentDependencies
): Promise<OutboundReply> {
  if (!dependencies.registrar) {
    return {
      chatId: context.chat.id,
      text: `I understood this as ${intent.kind}, but that action is not connected yet.`
    };
  }

  const result = await dependencies.registrar.execute({
    externalIdOrUrl: intent.externalIdOrUrl,
    ...(intent.documentType ? { documentType: intent.documentType } : {}),
    ...(intent.subjectId ? { subjectId: intent.subjectId } : {})
  });
  await dependencies.saveLastOperation(context, {
    operationKind: "document_registered",
    entityKind: "document",
    entityId: result.document.id,
    entityLabel: result.document.name,
    document: result.document
  });

  return {
    chatId: context.chat.id,
    text: formatRegisteredDocumentReply(result.document)
  };
}

export interface FindDocumentsDependencies {
  readonly lookup?: DocumentLookup | undefined;
}

export async function handleFindDocuments(
  context: AcceptedMessageContext,
  intent: Extract<InboundIntent, { readonly kind: "find_document" }>,
  dependencies: FindDocumentsDependencies
): Promise<OutboundReply> {
  if (!dependencies.lookup) {
    return {
      chatId: context.chat.id,
      text: `I understood this as ${intent.kind}, but that action is not connected yet.`
    };
  }

  const result = await dependencies.lookup.execute({
    ...(intent.query ? { query: intent.query } : {}),
    ...(intent.documentType ? { documentType: intent.documentType } : {}),
    ...(intent.subjectId ? { subjectId: intent.subjectId } : {}),
    ...(intent.requests ? { requests: intent.requests } : {})
  });

  return {
    chatId: context.chat.id,
    text: result.text
  };
}

export interface ManageDocumentDependencies {
  readonly manager?: DocumentManager | undefined;
  readonly pendingStore?: PendingDocumentDecisionStore | undefined;
  readonly now: () => Date;
}

export async function handleManageDocument(
  context: AcceptedMessageContext,
  intent: Extract<
    InboundIntent,
    { readonly kind: "update_document" | "archive_document" }
  >,
  lastOperation: LastOperationContext | undefined,
  dependencies: ManageDocumentDependencies
): Promise<OutboundReply> {
  if (!dependencies.manager) {
    return {
      chatId: context.chat.id,
      text: `I understood this as ${intent.kind}, but that action is not connected yet.`
    };
  }

  const lastDocument =
    intent.kind === "update_document" && !intent.query
      ? documentFromLastOperation(lastOperation)
      : undefined;
  const query = intent.query ?? lastDocument?.name;

  if (!query) {
    return {
      chatId: context.chat.id,
      text: "Which document should I update?"
    };
  }

  const result = await dependencies.manager.execute(
    intent.kind === "archive_document"
      ? {
          action: "archive",
          query
        }
      : {
          action: "update_metadata",
          query,
          ...(lastDocument ? { document: lastDocument } : {}),
          ...(intent.documentType ? { documentType: intent.documentType } : {}),
          ...(intent.subjectId ? { subjectId: intent.subjectId } : {})
        }
  );

  if (result.pending) {
    const now = dependencies.now();
    await dependencies.pendingStore?.save({
      chatId: context.chat.id,
      actorId: context.actor.id,
      action:
        result.pending.action.action === "archive"
          ? { kind: "archive" }
          : {
              kind: "update_metadata",
              ...(result.pending.action.documentType
                ? { documentType: result.pending.action.documentType }
                : {}),
              ...(result.pending.action.subjectId
                ? { subjectId: result.pending.action.subjectId }
                : {})
            },
      candidates: result.pending.candidates,
      createdAt: now,
      expiresAt: new Date(now.getTime() + THIRTY_MINUTES_MS)
    });
  }

  return {
    chatId: context.chat.id,
    text: result.text
  };
}
