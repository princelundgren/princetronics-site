import { describe, expect, it } from 'vitest';
import { splitAtFirstStep } from '../src/lib/guide-body';

describe('splitAtFirstStep', () => {
  it('splits before the first h2', () => {
    expect(splitAtFirstStep('<p>Intro</p><h2 id="a">A</h2><p>x</p>')).toEqual({
      intro: '<p>Intro</p>',
      steps: '<h2 id="a">A</h2><p>x</p>',
    });
  });

  it('a body with no h2 is all intro', () => {
    expect(splitAtFirstStep('<p>Only</p>')).toEqual({ intro: '<p>Only</p>', steps: '' });
  });

  it('a body that starts with a step has no intro', () => {
    expect(splitAtFirstStep('<h2>A</h2>')).toEqual({ intro: '', steps: '<h2>A</h2>' });
  });

  it('does not split at an h2 written inside a code block', () => {
    const body = '<p>Intro</p><pre><code>&lt;h2&gt;</code></pre><h2 id="a">A</h2>';
    expect(splitAtFirstStep(body).steps).toBe('<h2 id="a">A</h2>');
  });
});
