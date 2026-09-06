import type { PendingDocumentPlacementDecision } from "../../../../ports/state-repository-port.js";
import type { AcceptedMessageContext } from "../process-inbound-message.js";
import { canonicalDocumentFolderPath } from "../dispatch-command-helpers.js";

interface PendingDocumentPlacementStore {
  save(input: PendingDocumentPlacementDecision): Promise<void>;
}

interface DocumentFolderResolver {
  findFolderIdByPath(path: string): string | undefined;
}

export interface SavePlacementSuggestionDependencies {
  readonly store?: PendingDocumentPlacementStore | undefined;
  readonly folderResolver?: DocumentFolderResolver | undefined;
  readonly now: () => Date;
}

/**
 * Shared collaborator (DC-ARCH-001): record a pending "move this document to its
 * canonical folder?" suggestion. Extracted from the dispatcher so file/document
 * feature handlers can depend on it directly instead of on a dispatcher method.
 * Returns whether a suggestion was saved.
 */
export async function savePlacementSuggestion(
  context: AcceptedMessageContext,
  documents: readonly PendingDocumentPlacementDecision["document"][],
  dependencies: SavePlacementSuggestionDependencies
): Promise<boolean> {
  const [document] = documents;

  if (!document || !dependencies.store) {
    return false;
  }

  const targetFolderPath = canonicalDocumentFolderPath(document);
  const targetFolderId =
    dependencies.folderResolver?.findFolderIdByPath(targetFolderPath);
  const now = dependencies.now();

  await dependencies.store.save({
    chatId: context.chat.id,
    actorId: context.actor.id,
    document,
    targetFolderPath,
    ...(targetFolderId ? { targetFolderId } : {}),
    createdAt: now,
    expiresAt: new Date(now.getTime() + 30 * 60 * 1000)
  });

  return true;
}
