// @ts-check
import { join } from 'node:path';
import mdx from '@astrojs/mdx';
import { defineConfig } from 'astro/config';
import { resolveContentDir } from './src/lib/content-dir.ts';

const contentDir = resolveContentDir(process.env, process.cwd());

export default defineConfig({
  site: 'https://www.princetronics.com',
  trailingSlash: 'always',
  build: { format: 'directory' },
  publicDir: join(contentDir, 'public'),
  integrations: [mdx()],
});
