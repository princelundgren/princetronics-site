import { type CollectionEntry, getCollection } from 'astro:content';

export type Section = 'projects' | 'articles';

/** The page URL of an entry: `/<section>/<id>/`. */
export function entryUrl(section: Section, id: string): string {
  return `/${section}/${id}/`;
}

/** Whether an entry belongs on the site: drafts show in `astro dev` and never in a production build. */
export function isPublished(entry: { data: { draft: boolean } }, isProduction: boolean): boolean {
  return !isProduction || !entry.data.draft;
}

/** Sort comparator: newest `publishDate` first. */
export function byNewest(a: { data: { publishDate: Date } }, b: { data: { publishDate: Date } }): number {
  return b.data.publishDate.getTime() - a.data.publishDate.getTime();
}

/** Every entry of a section that belongs on the site, newest first. All listings go through this. */
export async function publishedEntries<S extends Section>(section: S): Promise<CollectionEntry<S>[]> {
  const entries = await getCollection(section, (entry) => isPublished(entry, import.meta.env.PROD));
  return entries.sort(byNewest);
}

/** Every published project and article together, newest first: the home page, tag pages and the feed. */
export async function allPublishedEntries(): Promise<CollectionEntry<Section>[]> {
  const [projects, articles] = await Promise.all([publishedEntries('projects'), publishedEntries('articles')]);
  return [...projects, ...articles].sort(byNewest);
}
