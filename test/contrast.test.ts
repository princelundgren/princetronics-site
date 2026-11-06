import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../src/lib/contrast';

type Palette = Record<string, string>;

const tokensIn = (block: string): Palette =>
  Object.fromEntries([...block.matchAll(/(--[\w-]+):\s*(#[0-9a-f]{3,6})\s*;/gi)].map(([, name, value]) => [name, value]));

// The light scheme is the first `:root` block; the dark one is the `:root` inside the dark media query, over it.
function palettes(css: string): { light: Palette; dark: Palette } {
  const light = tokensIn(css.match(/^:root\s*{([^}]*)}/m)?.[1] ?? '');
  const dark = tokensIn(css.match(/@media \(prefers-color-scheme: dark\)\s*{\s*:root\s*{([^}]*)}/)?.[1] ?? '');
  return { light, dark: { ...light, ...dark } };
}

function tokenValue(palette: Palette, token: string): string {
  const value = palette[token];
  if (value === undefined) throw new Error(`The palette has no ${token}`);
  return value;
}

const pairs = [
  ['--text', '--bg'],
  ['--heading', '--bg'],
  ['--muted', '--bg'],
  ['--link', '--bg'],
  ['--header-text', '--header-bg'],
  ['--header-muted', '--header-bg'],
  ['--tag-text', '--tag-bg'],
  ['--code-text', '--code-bg'],
  ['--demo-text', '--demo-bg'],
] as const;

describe('contrastRatio', () => {
  it('follows the WCAG 2.x formula, for #rgb and #rrggbb', () => {
    expect(contrastRatio('#666', '#fff').toFixed(2)).toBe('5.74');
    expect(contrastRatio('#74b6d8', '#ffffff').toFixed(2)).toBe('2.23');
  });

  it('is the same either way round', () => {
    expect(contrastRatio('#fff', '#666')).toBe(contrastRatio('#666', '#fff'));
  });
});

describe('palette', () => {
  const css = readFileSync('src/styles/global.css', 'utf8');

  it('meets AA in both schemes', () => {
    for (const [scheme, palette] of Object.entries(palettes(css))) {
      for (const [foreground, background] of pairs) {
        const ratio = contrastRatio(tokenValue(palette, foreground), tokenValue(palette, background));
        expect(ratio, `${scheme}: ${foreground} on ${background}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('a missing token fails the palette test, naming it', () => {
    expect(() => tokenValue(palettes(':root { --bg: #fff; }').dark, '--text')).toThrow('--text');
  });
});
