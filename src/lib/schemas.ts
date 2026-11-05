import { z } from 'astro/zod';
import { tagSlug } from './tags';

/** The `image()` helper Astro passes to a collection schema; tests pass a stand-in. */
export type ImageField<T extends z.ZodType = z.ZodType> = () => T;

const partSchema = z.object({
  name: z.string(),
  quantity: z.number().int().positive(),
  price: z.string().optional(),
  whereToBuy: z.string(),
});

const guideSchema = z.object({
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']),
  time: z.string(),
  cost: z.string(),
  parts: z.array(partSchema).min(1),
  tools: z.array(z.string()),
});

const tagSchema = z.string().refine((tag) => tagSlug(tag) !== '', {
  error: (issue) => `Tag ${JSON.stringify(issue.input)} needs at least one ASCII letter or digit to make its page URL`,
});

function entryFields<T extends z.ZodType>(image: ImageField<T>) {
  return {
    title: z.string(),
    summary: z.string(),
    publishDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    draft: z.boolean().default(false),
    tags: z.array(tagSchema).default([]),
    cover: image(),
    coverAlt: z.string(),
    why: z.string(),
    how: z.string(),
    result: z.string(),
    legacySlug: z.string().optional(),
  };
}

/** Project frontmatter, without `relatedArticles`, which needs Astro's `reference()` and is added in the content config. */
export function makeProjectSchema<T extends z.ZodType>(image: ImageField<T>) {
  return z.object({
    ...entryFields(image),
    area: z.enum(['maker', 'software']),
    repoUrl: z.url().optional(),
    guide: guideSchema.optional(),
  });
}

/** Article frontmatter. */
export function makeArticleSchema<T extends z.ZodType>(image: ImageField<T>) {
  return z.object(entryFields(image));
}

/** One entry of `learning.json`. */
export const learningSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.url(),
  type: z.enum(['guide', 'open-source', 'course']),
  topic: z.string(),
  why: z.string(),
});

/** Frontmatter of a standalone page (About, Follow). */
export const pageSchema = z.object({
  title: z.string(),
  summary: z.string(),
});

const commentSchema = z.object({
  id: z.number().int().positive(),
  parent: z.number().int().positive().nullable(),
  author: z.string(),
  date: z.coerce.date(),
  text: z.string(),
});

/** A file of old comments for one entry: `comments/<section>/<slug>.json`. */
export const commentFileSchema = z.object({
  comments: z.array(commentSchema),
});

export type Comment = z.infer<typeof commentSchema>;
export type Guide = z.infer<typeof guideSchema>;
export type LearningEntry = z.infer<typeof learningSchema>;
