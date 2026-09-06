import type { OutboundReply } from "../../../../core/domain/messaging/reply.js";
import type {
  PendingDocumentPlacementDecision,
  PendingFileDuplicateDecision
} from "../../../../ports/state-repository-port.js";
import type { AcceptedMessageContext } from "../process-inbound-message.js";
import type { FileInboxDocumentUploader } from "../dispatch-accepted-command.js";
import type { FileUploadDestination } from "../dispatch-command-helpers.js";
import {
  formatPlacementSuggestionLines,
  formatUploadedDocumentsReply,
  pendingActorDeniedReply
} from "../dispatch-command-helpers.js";

export interface PendingFileDuplicateDestinationDependencies {
  readonly uploadFromInbox?: FileInboxDocumentUploader | undefined;
  readonly storeAttachments: (
    context: AcceptedMessageContext,
    destination: FileUploadDestination
  ) => Promise<OutboundReply>;
  readonly savePlacementSuggestion: (
    context: AcceptedMessageContext,
    documents: readonly PendingDocumentPlacementDecision["document"][]
  ) => Promise<boolean>;
  readonly clearPending: (chatId: string) => Promise<void> | undefined;
}

/**
 * Feature-owned handler for the file-duplicate destination sub-branch: when the
 * user answers a duplicate prompt with a destination (local vs Drive), route the
 * existing inbox record accordingly. Depends on the shared attachment storage
 * and placement services via injected callbacks. Stage C of DC-ARCH-001.
 */
export async function handlePendingFileDuplicateDestination(
  context: AcceptedMessageContext,
  pending: PendingFileDuplicateDecision,
  destination: FileUploadDestination,
  dependencies: PendingFileDuplicateDestinationDependencies
): Promise<OutboundReply> {
  const deniedReply = pendingActorDeniedReply(context, pending);
  if (deniedReply) {
    return deniedReply;
  }

  if (destination === "google_drive" && dependencies.uploadFromInbox) {
    const upload = await dependencies.uploadFromInbox.execute({
      fileInboxRecordId: pending.existingRecordId
    });

    if (upload.status === "not_found") {
      return {
        chatId: context.chat.id,
        text: `Не могу сохранить ${pending.fileName} в Google Drive: локальная запись не найдена. Пришли файл еще раз.`
      };
    }

    const placementSuggested = await dependencies.savePlacementSuggestion(
      context,
      [upload.document]
    );

    await dependencies.clearPending(context.chat.id);

    return {
      chatId: context.chat.id,
      text: [
        formatUploadedDocumentsReply([upload.document]),
        ...(placementSuggested
          ? formatPlacementSuggestionLines(upload.document)
          : [])
      ].join("\n")
    };
  }

  if (!pending.provider || !pending.receivedAt || !pending.sourceAttachment) {
    return {
      chatId: context.chat.id,
      text: `Не могу сохранить ${pending.fileName} в выбранное место: не сохранились данные исходного вложения. Пришли файл еще раз.`
    };
  }

  const reply = await dependencies.storeAttachments(
    {
      ...context,
      provider: pending.provider,
      receivedAt: pending.receivedAt,
      attachments: [pending.sourceAttachment]
    },
    destination
  );

  await dependencies.clearPending(context.chat.id);

  return reply;
}
