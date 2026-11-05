import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveContentDir } from '../src/lib/content-dir';

describe('resolveContentDir', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'content-dir-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('resolves CONTENT_DIR relative to cwd', () => {
    mkdirSync(join(root, 'c', 'projects'), { recursive: true });
    mkdirSync(join(root, 'site'));

    expect(resolveContentDir({ CONTENT_DIR: '../c' }, join(root, 'site'))).toBe(join(root, 'c'));
  });

  it('defaults to fixtures/content', () => {
    mkdirSync(join(root, 'fixtures', 'content', 'projects'), { recursive: true });

    expect(resolveContentDir({}, root)).toBe(join(root, 'fixtures', 'content'));
  });

  it('fails naming a missing folder', () => {
    const missing = join(root, 'nowhere');

    expect(() => resolveContentDir({ CONTENT_DIR: missing }, root)).toThrow(missing);
  });

  it('fails when projects/ is missing', () => {
    mkdirSync(join(root, 'empty'));

    expect(() => resolveContentDir({ CONTENT_DIR: 'empty' }, root)).toThrow(/projects/);
  });
});
