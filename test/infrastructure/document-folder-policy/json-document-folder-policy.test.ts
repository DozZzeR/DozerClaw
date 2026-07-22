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
        status: "resolved",
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

  it("uses personal subfolder aliases instead of broad parent folder for Russian passport names", () => {
    const policy = JsonDocumentFolderPolicy.fromJson(
      JSON.stringify({
        folders: [
          {
            path: "01_Личные_документы",
            driveFolderId: "folder-personal",
            description: "Актуальные документы, удостоверяющие личность",
            documentTypes: ["passport", "id_card"],
            subjects: ["alexey", "victoria"],
            aliases: ["личные документы", "паспорт"],
            examples: [],
            folders: [
              {
                path: "01_Личные_документы/Alexey",
                driveFolderId: "folder-personal-alexey",
                description: "Личные документы Алексея",
                documentTypes: ["passport", "id_card"],
                subjects: ["alexey"],
                aliases: ["алексей", "а.горяйнов", "горяйнов а", "паспорт горяйнов а"],
                examples: []
              },
              {
                path: "01_Личные_документы/Victoria",
                driveFolderId: "folder-personal-victoria",
                description: "Личные документы Виктории",
                documentTypes: ["passport", "id_card"],
                subjects: ["victoria"],
                aliases: ["виктория", "в.горяйнова", "горяйнова в"],
                examples: []
              }
            ]
          }
        ]
      })
    );

    expect(
      policy.resolveUploadFolder({
        fileName: "паспорт Горяйнов А В.pdf",
        userText: "сохрани файл в гугл. это паспорт",
        documentType: "identity"
      })
    ).toEqual(
      expect.objectContaining({
        status: "resolved",
        path: "01_Личные_документы/Alexey",
        folderId: "folder-personal-alexey"
      })
    );
  });

  it("asks for a child folder choice when only the parent folder matches", () => {
    const policy = JsonDocumentFolderPolicy.fromJson(
      JSON.stringify({
        folders: [
          {
            path: "01_Личные_документы",
            driveFolderId: "folder-personal",
            description: "Актуальные документы, удостоверяющие личность",
            documentTypes: ["passport", "id_card"],
            subjects: ["alexey", "victoria"],
            aliases: ["личные документы", "паспорт"],
            examples: [],
            folders: [
              {
                path: "01_Личные_документы/Alexey",
                driveFolderId: "folder-personal-alexey",
                description: "Личные документы Алексея",
                documentTypes: ["passport", "id_card"],
                subjects: ["alexey"],
                aliases: ["алексей"],
                examples: []
              },
              {
                path: "01_Личные_документы/Victoria",
                driveFolderId: "folder-personal-victoria",
                description: "Личные документы Виктории",
                documentTypes: ["passport", "id_card"],
                subjects: ["victoria"],
                aliases: ["виктория"],
                examples: []
              }
            ]
          }
        ]
      })
    );

    expect(
      policy.resolveUploadFolder({
        fileName: "passport.pdf",
        userText: "сохрани паспорт",
        documentType: "identity"
      })
    ).toEqual({
      status: "needs_choice",
      path: "01_Личные_документы",
      folderId: "folder-personal",
      confidence: expect.any(Number),
      options: [
        {
          path: "01_Личные_документы/Alexey",
          folderId: "folder-personal-alexey",
          documentTypes: ["passport", "id_card"],
          subjects: ["alexey"]
        },
        {
          path: "01_Личные_документы/Victoria",
          folderId: "folder-personal-victoria",
          documentTypes: ["passport", "id_card"],
          subjects: ["victoria"]
        }
      ]
    });
  });
});
