import { z } from 'astro/zod';

const wordpressId = z.string().regex(/^\d+$/, 'a WordPress id is digits only');
const sitePath = z.string().regex(/^\/(.*\/)?$/, 'a path starts and ends with "/"');
const termKey = z.string().regex(/^(category|tag)\/[^/]+$/, 'a term key is "category/<slug>" or "tag/<slug>"');

/**
 * `<CONTENT_DIR>/redirects.json`: what the viewer-request function needs from WordPress beyond each entry's
 * `legacySlug`. `posts` maps a post id to its legacy slug, `pages` a page id to its new path, `attachments` an
 * attached media id to its post's id, `terms` a category or tag key to its name, and `paths` an old path to a new one.
 */
export const redirectDataSchema = z
  .object({
    posts: z.record(wordpressId, z.string().min(1)),
    pages: z.record(wordpressId, sitePath),
    attachments: z.record(wordpressId, wordpressId),
    terms: z.record(termKey, z.string().min(1)),
    paths: z.record(sitePath, sitePath),
  })
  .strict();

export type RedirectData = z.infer<typeof redirectDataSchema>;
