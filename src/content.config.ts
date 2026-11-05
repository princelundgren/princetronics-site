import { join } from 'node:path';
import { defineCollection, reference } from 'astro:content';
import { file, glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { resolveContentDir } from './lib/content-dir';
import { commentFileSchema, learningSchema, makeArticleSchema, makeProjectSchema, pageSchema } from './lib/schemas';

const contentDir = resolveContentDir(process.env, process.cwd());

const projects = defineCollection({
  loader: glob({ base: join(contentDir, 'projects'), pattern: '*.{md,mdx}' }),
  schema: ({ image }) =>
    makeProjectSchema(image).extend({
      relatedArticles: z.array(reference('articles')).default([]),
    }),
});

const articles = defineCollection({
  loader: glob({ base: join(contentDir, 'articles'), pattern: '*.{md,mdx}' }),
  schema: ({ image }) => makeArticleSchema(image),
});

const learning = defineCollection({
  loader: file(join(contentDir, 'learning.json')),
  schema: learningSchema,
});

const pages = defineCollection({
  loader: glob({ base: join(contentDir, 'pages'), pattern: '*.md' }),
  schema: pageSchema,
});

const comments = defineCollection({
  loader: glob({ base: join(contentDir, 'comments'), pattern: '**/*.json' }),
  schema: commentFileSchema,
});

export const collections = { projects, articles, learning, pages, comments };
