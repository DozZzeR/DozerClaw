export interface SubjectAliasRepositoryPort {
  resolveCanonicalSubjectId(subjectId: string): Promise<string>;
  saveSubjectAlias(input: SubjectAliasInput): Promise<void>;
}

export interface SubjectAliasInput {
  readonly aliasSubjectId: string;
  readonly canonicalSubjectId: string;
}
