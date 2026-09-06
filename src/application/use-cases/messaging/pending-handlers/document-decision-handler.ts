import type { OutboundReply } from "../../../../core/domain/messaging/reply.js";
import type {
  PendingDocumentDecision,
  PendingDocumentPlacementDecision
} from "../../../../ports/state-repository-port.js";
import type { AcceptedMessageContext } from "../process-inbound-message.js";
import type {
  DocumentManager,
  DocumentSearchDescriptionRecorder,
  MessageDocumentAttachmentStore
} from "../dispatch-accepted-command.js";
import {
  formatDocumentSearchDescriptionResult,
  formatPlacementSuggestionLines,
  formatUploadedDocumentsReply,
  formatUploadFolderChoicePrompt,
  isUploadedDocumentMetadataDecision,
  parseDocumentMetadata,
  parseFamilyFactArchiveDecision,
  parseSkipDocumentMetadata,
  parseUploadFolderChoice,
  pendingActorDeniedReply,
  selectedUploadFolderMetadata
} from "../dispatch-command-helpers.js";

export interface PendingDocumentDecisionDependencies {
  readonly documentManager?: DocumentManager | undefined;
  readonly documentAttachmentStore?: MessageDocumentAttachmentStore | undefined;
  readonly documentSearchDescriptionRecorder?:
    | DocumentSearchDescriptionRecorder
    | undefined;
  readonly savePlacementSuggestion: (
    context: AcceptedMessageContext,
    documents: readonly PendingDocumentPlacementDecision["document"][]
  ) => Promise<boolean>;
  readonly clearPending: (chatId: string) => Promise<void> | undefined;
}

/**
 * Feature-owned handler for document pending decisions: upload-folder choice,
 * search-description capture, uploaded-document metadata, and archive/update
 * candidate selection. Extracted from the dispatcher; depends on the document
 * manager, Drive attachment store, search recorder and placement service via
 * injection. Stage C of DC-ARCH-001.
 */
export async function handlePendingDocumentDecision(
  context: AcceptedMessageContext,
  pending: PendingDocumentDecision,
  dependencies: PendingDocumentDecisionDependencies
): Promise<OutboundReply> {
  const deniedReply = pendingActorDeniedReply(context, pending);
  if (deniedReply) {
    return deniedReply;
  }

  if (pending.action.kind === "choose_upload_folder") {
    return handleUploadFolderChoice(context, pending, dependencies);
  }

  if (pending.action.kind === "describe_for_search") {
    return handleSearchDescription(context, pending, dependencies);
  }

  if (isUploadedDocumentMetadataDecision(pending)) {
    return handleUploadedMetadata(context, pending, dependencies);
  }

  const decision = parseFamilyFactArchiveDecision(context.text);

  if (decision === undefined) {
    return {
      chatId: context.chat.id,
      text: [
        "Я жду выбор документа.",
        'Можно написать номер документа или "отмена".'
      ].join("\n")
    };
  }

  if (decision === "cancel") {
    await dependencies.clearPending(context.chat.id);

    return {
      chatId: context.chat.id,
      text: "Ок, не меняю документ."
    };
  }

  if (!dependencies.documentManager) {
    return {
      chatId: context.chat.id,
      text: "Document manager is not configured."
    };
  }

  const document = pending.candidates[decision];

  if (!document) {
    return {
      chatId: context.chat.id,
      text: "I could not find that document candidate anymore."
    };
  }

  const result = await dependencies.documentManager.execute(
    pending.action.kind === "archive"
      ? {
          action: "archive",
          query: document.name,
          document
        }
      : {
          action: "update_metadata",
          query: document.name,
          document,
          ...(pending.action.documentType
            ? { documentType: pending.action.documentType }
            : {}),
          ...(pending.action.subjectId
            ? { subjectId: pending.action.subjectId }
            : {})
        }
  );
  await dependencies.clearPending(context.chat.id);

  return {
    chatId: context.chat.id,
    text: result.text
  };
}

async function handleUploadFolderChoice(
  context: AcceptedMessageContext,
  pending: PendingDocumentDecision,
  dependencies: PendingDocumentDecisionDependencies
): Promise<OutboundReply> {
  if (pending.action.kind !== "choose_upload_folder") {
    return {
      chatId: context.chat.id,
      text: "Document folder choice is not pending."
    };
  }

  const decision = parseUploadFolderChoice(context.text, pending.action.options);

  if (decision === "cancel") {
    await dependencies.clearPending(context.chat.id);

    return {
      chatId: context.chat.id,
      text: "Ок, не сохраняю файл."
    };
  }

  if (!decision) {
    return {
      chatId: context.chat.id,
      text: formatUploadFolderChoicePrompt({
        status: "needs_folder_choice",
        attachment: {
          fileName: pending.action.attachment.fileName,
          ...(pending.action.attachment.mimeType
            ? { mimeType: pending.action.attachment.mimeType }
            : {}),
          bytes: new Uint8Array()
        },
        parentPath: pending.action.parentPath,
        parentFolderId: pending.action.parentFolderId,
        options: pending.action.options,
        ...(pending.action.documentType
          ? { documentType: pending.action.documentType }
          : {}),
        ...(pending.action.subjectId
          ? { subjectId: pending.action.subjectId }
          : {})
      })
    };
  }

  if (!dependencies.documentAttachmentStore) {
    return {
      chatId: context.chat.id,
      text: "Google Drive upload is not configured yet. File was not saved."
    };
  }

  const uploaded = await dependencies.documentAttachmentStore.uploadPrepared({
    attachment: {
      fileName: pending.action.attachment.fileName,
      ...(pending.action.attachment.mimeType
        ? { mimeType: pending.action.attachment.mimeType }
        : {}),
      bytes: Buffer.from(pending.action.attachment.bytesBase64, "base64")
    },
    targetFolderId: decision.folderId,
    ...selectedUploadFolderMetadata(pending.action, decision)
  });
  await dependencies.clearPending(context.chat.id);

  return {
    chatId: context.chat.id,
    text: formatUploadedDocumentsReply([uploaded.document])
  };
}

async function handleSearchDescription(
  context: AcceptedMessageContext,
  pending: PendingDocumentDecision,
  dependencies: PendingDocumentDecisionDependencies
): Promise<OutboundReply> {
  if (parseSkipDocumentMetadata(context.text)) {
    await dependencies.clearPending(context.chat.id);

    return {
      chatId: context.chat.id,
      text: "Ок, оставляю документ без описания для поиска."
    };
  }

  if (!dependencies.documentSearchDescriptionRecorder) {
    return {
      chatId: context.chat.id,
      text: "Semantic document search storage is not configured."
    };
  }

  const updated: string[] = [];

  for (const document of pending.candidates) {
    const result =
      await dependencies.documentSearchDescriptionRecorder.execute({
        document,
        description: context.text
      });

    updated.push(formatDocumentSearchDescriptionResult(result.document, result));
  }
  await dependencies.clearPending(context.chat.id);

  return {
    chatId: context.chat.id,
    text: updated.join("\n")
  };
}

async function handleUploadedMetadata(
  context: AcceptedMessageContext,
  pending: PendingDocumentDecision,
  dependencies: PendingDocumentDecisionDependencies
): Promise<OutboundReply> {
  if (parseSkipDocumentMetadata(context.text)) {
    await dependencies.clearPending(context.chat.id);

    return {
      chatId: context.chat.id,
      text: "Ок, оставляю документ без metadata."
    };
  }

  const metadata = parseDocumentMetadata(context.text);

  if (!metadata.documentType && !metadata.subjectId) {
    return {
      chatId: context.chat.id,
      text: [
        "Я жду metadata для загруженного документа.",
        "Можно написать тип и subject, например: identity max, или skip."
      ].join("\n")
    };
  }

  if (!dependencies.documentManager) {
    return {
      chatId: context.chat.id,
      text: "Document manager is not configured."
    };
  }

  const updated: string[] = [];
  const updatedDocuments = pending.candidates.map((document) => ({
    ...document,
    ...metadata
  }));

  for (const document of updatedDocuments) {
    const result = await dependencies.documentManager.execute({
      action: "update_metadata",
      query: document.name,
      document,
      ...metadata
    });
    updated.push(result.text);
  }
  await dependencies.clearPending(context.chat.id);

  const placementSuggested = await dependencies.savePlacementSuggestion(
    context,
    updatedDocuments
  );

  return {
    chatId: context.chat.id,
    text: [
      updated.join("\n"),
      ...(placementSuggested
        ? formatPlacementSuggestionLines(updatedDocuments[0])
        : [])
    ].join("\n")
  };
}
