export function normalizeSubjectId(
  subjectId: string | undefined
): string | undefined {
  if (!subjectId) {
    return undefined;
  }

  const normalized = subjectId
    .trim()
    .toLowerCase()
    .replace(/^(subject|person|child|kid|family-member)\s*[:#/-]\s*/iu, "")
    .replace(/[^a-z0-9а-яё]+/giu, "-")
    .replace(/^-+|-+$/g, "");

  return normalized.length > 0 ? normalized : undefined;
}
