/** The URL key of a tag, the same for every spelling that differs only in case, spacing or punctuation. */
export function tagSlug(tag: string): string {
  return tag
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Every tag on the given entries, keyed by `tagSlug`, labelled with the first spelling seen. */
export function collectTags(entries: { data: { tags: string[] } }[]): Map<string, { label: string; count: number }> {
  const tags = new Map<string, { label: string; count: number }>();
  for (const tag of entries.flatMap((entry) => entry.data.tags)) {
    const key = tagSlug(tag);
    const seen = tags.get(key);
    tags.set(key, { label: seen?.label ?? tag.trim(), count: (seen?.count ?? 0) + 1 });
  }
  return tags;
}
