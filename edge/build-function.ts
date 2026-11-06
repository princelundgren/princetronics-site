import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'yaml';
import { resolveContentDir } from '../src/lib/content-dir';
import { redirectDataSchema, type RedirectData } from '../src/lib/redirect-data';
import { collectTags, tagSlug } from '../src/lib/tags';
import { entryUrl, type Section } from '../src/lib/urls';

const MAX_BYTES = 10_240;
const RESERVED_SLUGS = ['projects', 'articles', 'tags', 'learning', 'about', 'follow', 'rss.xml', 'wp-content', '_astro'];
const SECTIONS: Section[] = ['projects', 'articles'];

type PublishedEntry = { url: string; legacySlug?: string; tags: string[]; file: string };
type FunctionData = {
  slugs: Record<string, string>;
  ids: Record<string, string>;
  attachments: Record<string, number[]>;
  tags: string[];
  terms: Record<string, string>;
  paths: Record<string, string>;
};

function frontMatter(file: string): Record<string, unknown> {
  const match = readFileSync(file, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) throw new Error(`${file}: no front matter between leading "---" lines`);
  return parse(match[1]) ?? {};
}

function readPublishedEntries(contentDir: string): PublishedEntry[] {
  return SECTIONS.flatMap((section) => {
    const dir = join(contentDir, section);
    return readdirSync(dir)
      .filter((name) => /\.mdx?$/.test(name))
      .map((name) => ({ name, file: join(dir, name), data: frontMatter(join(dir, name)) }))
      .filter(({ data }) => data.draft !== true)
      .map(({ name, file, data }) => ({
        url: entryUrl(section, name.replace(/\.mdx?$/, '')),
        legacySlug: typeof data.legacySlug === 'string' ? data.legacySlug : undefined,
        tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
        file,
      }));
  });
}

function readRedirectData(contentDir: string): RedirectData {
  const file = join(contentDir, 'redirects.json');
  const parsed = redirectDataSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
  if (!parsed.success) throw new Error(`${file} is invalid: ${parsed.error.message}`);
  return parsed.data;
}

function slugUrls(entries: PublishedEntry[]): Record<string, string> {
  const slugs: Record<string, string> = {};
  for (const { legacySlug, url, file } of entries) {
    if (legacySlug === undefined) continue;
    if (RESERVED_SLUGS.includes(legacySlug)) {
      throw new Error(`${file}: legacySlug "${legacySlug}" would shadow the site's own /${legacySlug}/`);
    }
    if (legacySlug in slugs) {
      throw new Error(`${file}: legacySlug "${legacySlug}" is already used by the entry at ${slugs[legacySlug]}`);
    }
    slugs[legacySlug] = url;
  }
  return slugs;
}

function idUrls(data: RedirectData, slugs: Record<string, string>): Record<string, string> {
  const ids: Record<string, string> = {};
  for (const [id, legacySlug] of Object.entries(data.posts)) {
    if (!(legacySlug in slugs)) {
      throw new Error(`redirects.json: posts.${id} names legacySlug "${legacySlug}", which no published entry has`);
    }
    ids[`p${id}`] = slugs[legacySlug];
  }
  for (const [id, path] of Object.entries(data.pages)) {
    ids[`p${id}`] = path;
    ids[`page${id}`] = path;
  }
  return ids;
}

// Each post's attachment ids under the post's key in `ids`, so an attachment costs its digits, not a URL.
function attachmentIds(data: RedirectData): Record<string, number[]> {
  const attachments: Record<string, number[]> = {};
  for (const [id, postId] of Object.entries(data.attachments)) {
    if (!(postId in data.posts)) {
      throw new Error(`redirects.json: attachments.${id} names post ${postId}, which posts does not list`);
    }
    (attachments[`p${postId}`] ??= []).push(Number(id));
  }
  return attachments;
}

// A term whose own slug is its published tag's slug goes in `tags`; any other published term maps to its tag's slug.
function termTargets(data: RedirectData, entries: PublishedEntry[]): Pick<FunctionData, 'tags' | 'terms'> {
  const publishedTags = collectTags(entries.map(({ tags }) => ({ data: { tags } })));
  const tags = new Set<string>();
  const terms: Record<string, string> = {};
  for (const [key, name] of Object.entries(data.terms)) {
    const slug = tagSlug(name);
    if (!publishedTags.has(slug)) continue;
    if (key.split('/')[1] === slug) tags.add(slug);
    else terms[key] = slug;
  }
  return { tags: [...tags], terms };
}

// The function redirects a path and everything under it, so no key may cover the site's own pages or a target.
function pathUrls(data: RedirectData): Record<string, string> {
  const keys = Object.keys(data.paths);
  for (const [from, to] of Object.entries(data.paths)) {
    const section = from.split('/')[1];
    if (section === '' || RESERVED_SLUGS.includes(section)) {
      throw new Error(`redirects.json: paths["${from}"] would shadow the site's own pages`);
    }
    const covering = keys.find((key) => to.startsWith(key));
    if (covering) {
      throw new Error(`redirects.json: paths["${from}"] points at "${to}", which paths["${covering}"] redirects again`);
    }
  }
  return data.paths;
}

/**
 * The viewer-request function's code: `template` with its `__REDIRECT_DATA__` placeholder replaced by the redirect
 * data of the content folder, every target resolved to a final site path. Throws, naming the file or value, on
 * invalid `redirects.json`, a duplicate or reserved `legacySlug`, a post id no published entry answers, a path that
 * covers the site's own pages or whose target another path redirects, or code over CloudFront's 10,240-byte limit.
 */
export function buildFunctionCode(contentDir: string, template: string): string {
  const entries = readPublishedEntries(contentDir);
  const data = readRedirectData(contentDir);
  const slugs = slugUrls(entries);
  const functionData: FunctionData = {
    slugs,
    ids: idUrls(data, slugs),
    attachments: attachmentIds(data),
    ...termTargets(data, entries),
    paths: pathUrls(data),
  };
  const code = template.replace('__REDIRECT_DATA__', () => JSON.stringify(functionData));
  const bytes = Buffer.byteLength(code, 'utf8');
  if (bytes > MAX_BYTES) {
    throw new Error(`The generated function is ${bytes} bytes, over CloudFront's ${MAX_BYTES}-byte limit`);
  }
  return code;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const contentDir = resolveContentDir(process.env, process.cwd());
  const template = readFileSync(new URL('./viewer-request.js', import.meta.url), 'utf8');
  const code = buildFunctionCode(contentDir, template);
  mkdirSync('edge-dist', { recursive: true });
  writeFileSync('edge-dist/viewer-request.js', code);
  console.log(`edge-dist/viewer-request.js: ${Buffer.byteLength(code, 'utf8')} bytes from ${contentDir}`);
}
