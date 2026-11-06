// @ts-check
import { join } from 'node:path';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { defineConfig, fontProviders } from 'astro/config';
import { resolveContentDir } from './src/lib/content-dir.ts';

const contentDir = resolveContentDir(process.env, process.cwd());

export default defineConfig({
  site: 'https://www.princetronics.com',
  trailingSlash: 'always',
  build: { format: 'directory' },
  publicDir: join(contentDir, 'public'),
  integrations: [mdx(), sitemap()],
  markdown: { shikiConfig: { theme: 'github-dark-default' } },
  fonts: [
    {
      name: 'Source Serif 4',
      cssVariable: '--font-heading',
      provider: fontProviders.fontsource(),
      weights: [300, 600],
      styles: ['normal'],
      subsets: ['latin'],
      fallbacks: ['Georgia', 'serif'],
    },
    {
      name: 'Inter',
      cssVariable: '--font-text',
      provider: fontProviders.fontsource(),
      weights: [400, 500],
      styles: ['normal'],
      subsets: ['latin'],
      fallbacks: ['system-ui', 'sans-serif'],
    },
  ],
});
