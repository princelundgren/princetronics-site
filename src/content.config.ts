import { join } from 'node:path';
import { defineCollection, reference } from 'astro:content';
import { file, glob, type Loader } from 'astro/loaders';
import { z } from 'astro/zod';
import { checkCommentFilesHaveEntries } from './lib/comment-files';
import { resolveContentDir } from './lib/content-dir';
import { withoutDrafts } from './lib/without-drafts';
import { commentFileSchema, learningSchema, makeArticleSchema, makeProjectSchema, pageSchema } from './lib/schemas';

const contentDir = resolveContentDir(process.env, process.cwd());
checkCommentFilesHaveEntries(contentDir);

const entriesIn = (folder: string): Loader => {
  const loader = glob({ base: join(contentDir, folder), pattern: '*.{md,mdx}' });
  return import.meta.env.PROD ? withoutDrafts(loader) : loader;
};

const projects = defineCollection({
  loader: entriesIn('projects'),
  schema: ({ image }) =>
    makeProjectSchema(image).extend({
      relatedArticles: z.array(reference('articles')).default([]),
    }),
});

const articles = defineCollection({
  loader: entriesIn('articles'),
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
