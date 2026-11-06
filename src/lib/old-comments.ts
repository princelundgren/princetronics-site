import { getCollection } from 'astro:content';
import type { Section } from './urls';
import type { Comment } from './schemas';

/** The old comments kept for an entry, or none: most entries have no comments file. */
export async function oldCommentsFor(section: Section, id: string): Promise<Comment[]> {
  const commentFiles = await getCollection('comments');
  return commentFiles.find((file) => file.id === `${section}/${id}`)?.data.comments ?? [];
}
