import { z } from 'astro/zod';
import { describe, expect, it } from 'vitest';
import { commentFileSchema, learningSchema, makeProjectSchema } from '../src/lib/schemas';

const imageStub = () => z.string();
const projectSchema = makeProjectSchema(imageStub);

const showcase = {
  title: 'FPV drone',
  summary: 'A small racing drone.',
  publishDate: '2026-01-10',
  cover: 'cover.jpg',
  coverAlt: 'The drone on a bench',
  area: 'maker',
};

const part = { name: 'Arduino Uno', quantity: 1, whereToBuy: 'Any electronics shop' };
const guide = { parts: [part], tools: ['Soldering iron'] };

function parseWithGuide(guideOverride: object) {
  return projectSchema.safeParse({ ...showcase, guide: { ...guide, ...guideOverride } });
}

describe('project schema', () => {
  it('a showcase project needs no guide', () => {
    expect(projectSchema.safeParse(showcase).success).toBe(true);
  });

  it('a guide needs only its parts and tools', () => {
    expect(parseWithGuide({}).success).toBe(true);
  });

  it('a guide needs at least one part', () => {
    expect(parseWithGuide({ parts: [] }).success).toBe(false);
  });

  it('a part quantity must be a positive integer', () => {
    expect(parseWithGuide({ parts: [{ ...part, quantity: 0 }] }).success).toBe(false);
    expect(parseWithGuide({ parts: [{ ...part, quantity: 1.5 }] }).success).toBe(false);
  });

  it('price and whereToBuy are optional', () => {
    const { whereToBuy: _omitted, ...withoutShop } = part;
    expect(parseWithGuide({ parts: [withoutShop] }).success).toBe(true);
  });

  it('video takes a YouTube watch URL', () => {
    expect(projectSchema.safeParse({ ...showcase, video: 'https://www.youtube.com/watch?v=abc123' }).success).toBe(true);
  });

  it('video rejects other YouTube pages, other hosts and plain http, naming the field', () => {
    for (const video of [
      'https://www.youtube.com/playlist?list=x',
      'https://www.youtube.com/watch',
      'https://www.youtube.com/@example',
      'https://www.youtube.com/embed/abc123?v=abc123',
      'https://vimeo.com/1',
      'http://www.youtube.com/watch?v=abc123',
      'https://youtube.com.example.com/watch?v=abc123',
      'youtube.com/watch?v=abc123',
      'not a url',
    ]) {
      const result = projectSchema.safeParse({ ...showcase, video });
      expect(result.success, video).toBe(false);
      expect(result.error?.issues[0].path, video).toEqual(['video']);
    }
  });

  it('area accepts only maker or software', () => {
    expect(projectSchema.safeParse({ ...showcase, area: 'software' }).success).toBe(true);
    expect(projectSchema.safeParse({ ...showcase, area: 'hardware' }).success).toBe(false);
  });

  it('a tag needs a letter or digit, and the error names it', () => {
    const result = projectSchema.safeParse({ ...showcase, tags: ['Arduino', '!!!'] });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toContain('"!!!"');
  });

  it('repoUrl takes only a web link', () => {
    expect(projectSchema.safeParse({ ...showcase, repoUrl: 'https://github.com/example/drone' }).success).toBe(true);
    expect(projectSchema.safeParse({ ...showcase, repoUrl: 'javascript:alert(1)' }).success).toBe(false);
    expect(projectSchema.safeParse({ ...showcase, repoUrl: 'data:text/html,hi' }).success).toBe(false);
  });

  it('draft defaults to false and tags to []', () => {
    const parsed = projectSchema.parse(showcase);

    expect(parsed.draft).toBe(false);
    expect(parsed.tags).toEqual([]);
  });
});

describe('learning schema', () => {
  const entry = { id: 'mdn', title: 'MDN', url: 'https://developer.mozilla.org/', type: 'guide', topic: 'Web', why: 'Reference.' };

  it('url takes only a web link', () => {
    expect(learningSchema.safeParse(entry).success).toBe(true);
    expect(learningSchema.safeParse({ ...entry, url: 'javascript:alert(1)' }).success).toBe(false);
  });
});

describe('comment file schema', () => {
  const comment = { id: 7, parent: null, author: 'Ada', date: '2015-03-01', text: 'Thanks!' };

  it('a comment parent may be null', () => {
    expect(commentFileSchema.safeParse({ comments: [comment] }).success).toBe(true);
  });

  it('a comment id must be positive', () => {
    expect(commentFileSchema.safeParse({ comments: [{ ...comment, id: 0 }] }).success).toBe(false);
  });
});
