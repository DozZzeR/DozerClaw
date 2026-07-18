import { describe, expect, it } from "vitest";

import { JsonDocumentFolderPolicy } from "../../../src/infrastructure/providers/document-folder-policy/json-document-folder-policy.js";

describe("JsonDocumentFolderPolicy", () => {
  it("chooses the deepest confident folder from user text and metadata", () => {
    const policy = JsonDocumentFolderPolicy.fromJson(
      JSON.stringify({
        folders: [
          {
            path: "01_Личные_документы",
            driveFolderId: "folder-personal",
            description: "Актуальные документы, удостоверяющие личность",
            documentTypes: ["passport", "id_card"],
            subjects: ["alexey", "victoria"],
            aliases: ["личные документы", "личная карта"],
            examples: [],
            folders: [
              {
                path: "01_Личные_документы/Alexey",
                driveFolderId: "folder-personal-alexey",
                description: "Личные документы Алексея",
                documentTypes: ["passport", "id_card"],
                subjects: ["alexey"],
                aliases: ["алексей", "а.горяйнов"],
                examples: ["GoryainovAV-lična karta.pdf"]
              }
            ]
          }
        ]
      })
    );

    const resolved = policy.resolveUploadFolder({
      fileName: "GoryainovAV-lična karta.pdf",
      userText: "сохрани личную карту Алексея в гугл",
      documentType: "identity",
      subjectId: "alexey"
    });

    expect(resolved).toEqual(
      expect.objectContaining({
        path: "01_Личные_документы/Alexey",
        folderId: "folder-personal-alexey"
      })
    );
    expect(resolved?.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it("does not force a weak folder guess", () => {
    const policy = JsonDocumentFolderPolicy.fromJson(
      JSON.stringify({
        folders: [
          {
            path: "06_Семья_и_Быт/Разное_и_Архив",
            driveFolderId: "folder-misc",
            description: "Хобби, рецепты, генеалогия, связь, старые бэкапы",
            documentTypes: ["note", "image", "archive"],
            subjects: ["alexey", "victoria"],
            aliases: ["разное", "архив"],
            examples: []
          }
        ]
      })
    );

    expect(
      policy.resolveUploadFolder({
        fileName: "unknown.pdf",
        userText: "сохрани файл"
      })
    ).toBeUndefined();
  });
});
