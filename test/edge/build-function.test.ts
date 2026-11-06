import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildFunctionCode } from '../../edge/build-function';
import { isResponse, loadFunction, requestEvent } from '../../edge/simulate';

const fixtures = fileURLToPath(new URL('../../fixtures/content', import.meta.url));
const template = readFileSync(new URL('../../edge/viewer-request.js', import.meta.url), 'utf8');
const WWW = 'www.princetronics.com';

// Each test edits its own copy, so the fixture folder stays as committed.
function contentCopy(): string {
  const dir = mkdtempSync(join(tmpdir(), 'build-function-'));
  cpSync(fixtures, dir, { recursive: true });
  return dir;
}

function editRedirects(dir: string, edit: (data: Record<string, Record<string, string>>) => void): void {
  const file = join(dir, 'redirects.json');
  const data = JSON.parse(readFileSync(file, 'utf8'));
  edit(data);
  writeFileSync(file, JSON.stringify(data));
}

function addFrontMatter(file: string, line: string): void {
  writeFileSync(file, readFileSync(file, 'utf8').replace(/^---\n/, `---\n${line}\n`));
}

function locationOf(code: string, uri: string, query?: Record<string, string>): string | undefined {
  const result = loadFunction(code)(requestEvent(WWW, uri, query));
  return isResponse(result) ? result.headers?.location?.value : undefined;
}

describe('buildFunctionCode', () => {
  it('fills the template with the redirect data', () => {
    const code = buildFunctionCode(fixtures, template);
    expect(code).not.toContain('__REDIRECT_DATA__');
    expect(() => loadFunction(code)).not.toThrow();
  });

  it("redirects an entry's legacy slug and its WordPress ids to the entry", () => {
    const code = buildFunctionCode(fixtures, template);
    const entry = 'https://www.princetronics.com/projects/read-433mhz-codes/';
    expect(locationOf(code, '/read-433mhz-codes-with-arduino/')).toBe(entry);
    expect(locationOf(code, '/', { p: '101' })).toBe(entry);
    expect(locationOf(code, '/', { attachment_id: '201' })).toBe(entry);
    expect(locationOf(code, '/', { page_id: '2' })).toBe('https://www.princetronics.com/about/');
  });

  it("leaves out a draft's legacy slug", () => {
    const code = buildFunctionCode(fixtures, template);
    expect(code).not.toContain('old-robot');
    expect(locationOf(code, '/old-robot/')).toBeUndefined();
  });

  it('maps a term to the tag page of a published tag with that name', () => {
    const code = buildFunctionCode(fixtures, template);
    expect(locationOf(code, '/category/arduino/')).toBe('https://www.princetronics.com/tags/arduino/');
  });

  it('leaves out a term whose tag only a draft uses', () => {
    const code = buildFunctionCode(fixtures, template);
    expect(code).not.toContain('tag/robots');
    expect(locationOf(code, '/tag/robots/')).toBe('https://www.princetronics.com/');
  });

  it('fails on two entries with one legacy slug', () => {
    const dir = contentCopy();
    addFrontMatter(join(dir, 'projects/fpv-drone.mdx'), 'legacySlug: read-433mhz-codes-with-arduino');
    expect(() => buildFunctionCode(dir, template)).toThrow(/read-433mhz-codes-with-arduino/);
  });

  it('fails on a legacy slug that would shadow a section', () => {
    const dir = contentCopy();
    addFrontMatter(join(dir, 'articles/pin-your-ci-actions.md'), 'legacySlug: tags');
    expect(() => buildFunctionCode(dir, template)).toThrow(/"tags"/);
  });

  it('fails on a path that maps to itself', () => {
    const dir = contentCopy();
    editRedirects(dir, (data) => {
      data.paths['/follow/'] = '/follow/';
    });
    expect(() => buildFunctionCode(dir, template)).toThrow(/\/follow\//);
  });

  for (const [name, paths, named] of [
    ['shadows a section', { '/projects/': '/follow/' }, /\/projects\//],
    ['shadows the whole site', { '/': '/follow/' }, /"\/"/],
    ['points at another redirected path', { '/a/': '/b/', '/b/': '/follow/' }, /\/b\//],
    ['points under itself', { '/a/': '/a/b/' }, /\/a\/b\//],
  ] as const) {
    it(`fails on a path that ${name}`, () => {
      const dir = contentCopy();
      editRedirects(dir, (data) => {
        Object.assign(data.paths, paths);
      });
      expect(() => buildFunctionCode(dir, template)).toThrow(named);
    });
  }

  it("fits the old site's counts in 10,240 bytes: 12 posts, 63 attachments, 104 published terms", () => {
    const dir = contentCopy();
    const pad = (text: string, length: number) => text.padEnd(length, 'x').slice(0, length);
    const terms: Record<string, string> = {};
    const termNames: string[] = [];
    for (let i = 0; i < 104; i++) {
      const name = pad(`topic-${i}-`, 12 + (i % 21));
      termNames.push(name);
      terms[`${i % 2 ? 'tag' : 'category'}/${i % 5 ? name : `wp-${name}`}`] = name;
    }
    const posts: Record<string, string> = {};
    const attachments: Record<string, string> = {};
    for (let post = 0; post < 12; post++) {
      const slug = pad(`old-post-${post}-`, 32);
      posts[String(1000 + post)] = slug;
      const tags = termNames.filter((_, i) => i % 12 === post);
      writeFileSync(
        join(dir, 'projects', `${pad(`new-post-${post}-`, 32)}.md`),
        `---
title: Post ${post}
legacySlug: ${slug}
tags: ${JSON.stringify(tags)}
---
Body
`,
      );
    }
    for (let media = 0; media < 63; media++) attachments[String(5000 + media)] = String(1000 + (media % 12));
    editRedirects(dir, (data) => {
      Object.assign(data.posts, posts);
      Object.assign(data.attachments, attachments);
      Object.assign(data.terms, terms);
    });
    const code = buildFunctionCode(dir, template);
    expect(Buffer.byteLength(code, 'utf8')).toBeLessThanOrEqual(10_240);
    expect(locationOf(code, '/', { attachment_id: '5062' })).toMatch(/\/projects\/new-post-2-x+\/$/);
    expect(locationOf(code, `/category/wp-${termNames[0]}/`)).toBe(`https://www.princetronics.com/tags/${termNames[0]}/`);
    expect(locationOf(code, `/tag/${termNames[1]}/`)).toBe(`https://www.princetronics.com/tags/${termNames[1]}/`);
  });

  it('fails on a post id whose legacy slug no published entry has', () => {
    const dir = contentCopy();
    editRedirects(dir, (data) => {
      data.posts['102'] = 'old-robot';
    });
    expect(() => buildFunctionCode(dir, template)).toThrow(/old-robot/);
  });

  it('fails on redirects.json that breaks the schema, naming the file', () => {
    const dir = contentCopy();
    editRedirects(dir, (data) => {
      data.posts.abc = 'x';
    });
    expect(() => buildFunctionCode(dir, template)).toThrow(/redirects\.json/);
  });

  it('fails above 10,240 bytes, giving the size', () => {
    const dir = contentCopy();
    editRedirects(dir, (data) => {
      for (let i = 0; i < 300; i++) data.paths[`/old-path-number-${i}/`] = `/new-path-number-${i}/`;
    });
    expect(() => buildFunctionCode(dir, template)).toThrow(/\d+ bytes/);
  });
});
