import { describe, expect, it } from 'vitest';
import { redirectDataSchema } from '../src/lib/redirect-data';

const empty = { posts: {}, pages: {}, attachments: {}, terms: {}, paths: {} };

describe('redirectDataSchema', () => {
  it('accepts a file with every map empty', () => {
    expect(redirectDataSchema.safeParse(empty).success).toBe(true);
  });

  it('rejects an id that is not digits', () => {
    expect(redirectDataSchema.safeParse({ ...empty, posts: { abc: 'old-post' } }).success).toBe(false);
  });

  it('rejects a path without its trailing slash', () => {
    expect(redirectDataSchema.safeParse({ ...empty, pages: { '2': '/about' } }).success).toBe(false);
    expect(redirectDataSchema.safeParse({ ...empty, paths: { '/old': '/new/' } }).success).toBe(false);
  });
});
