export type Section = 'projects' | 'articles';

/** The page URL of an entry: `/<section>/<id>/`. */
export function entryUrl(section: Section, id: string): string {
  return `/${section}/${id}/`;
}
