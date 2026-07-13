export interface SubjectAliasRepositoryPort {
  resolveCanonicalSubjectId(subjectId: string): Promise<string>;
  saveSubjectAlias(input: SubjectAliasInput): Promise<void>;
  listSubjectAliases(): Promise<readonly SubjectAlias[]>;
  deleteSubjectAlias(aliasSubjectId: string): Promise<boolean>;
}

export interface SubjectAliasInput {
  readonly aliasSubjectId: string;
  readonly canonicalSubjectId: string;
}

export interface SubjectAlias {
  readonly aliasSubjectId: string;
  readonly canonicalSubjectId: string;
}
