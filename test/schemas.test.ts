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
  why: 'To learn flight controllers.',
  how: 'A carbon frame and a Betaflight board.',
  result: 'It flies.',
  area: 'maker',
};

const part = { name: 'Arduino Uno', quantity: 1, whereToBuy: 'Any electronics shop' };
const guide = { difficulty: 'beginner', time: '~1 hour', cost: '~100 SEK', parts: [part], tools: ['Soldering iron'] };

function parseWithGuide(guideOverride: object) {
  return projectSchema.safeParse({ ...showcase, guide: { ...guide, ...guideOverride } });
}

describe('project schema', () => {
  it('a showcase project needs no guide', () => {
    expect(projectSchema.safeParse(showcase).success).toBe(true);
  });

  it('a guide needs at least one part', () => {
    expect(parseWithGuide({ parts: [] }).success).toBe(false);
  });

  it('a part quantity must be a positive integer', () => {
    expect(parseWithGuide({ parts: [{ ...part, quantity: 0 }] }).success).toBe(false);
    expect(parseWithGuide({ parts: [{ ...part, quantity: 1.5 }] }).success).toBe(false);
  });

  it('price is optional, whereToBuy is not', () => {
    expect(parseWithGuide({ parts: [part] }).success).toBe(true);
    const { whereToBuy: _omitted, ...withoutShop } = part;
    expect(parseWithGuide({ parts: [withoutShop] }).success).toBe(false);
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
