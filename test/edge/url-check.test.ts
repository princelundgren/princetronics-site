import { afterEach, describe, expect, it, vi } from 'vitest';

// liveStep runs curl; this replaces execFile so no request leaves the machine, answering every call with a 200.
const execFile = vi.hoisted(() =>
  vi.fn((_command: string, _args: string[], callback: (error: Error | null, stdout: string) => void) => callback(null, '200 ')),
);
vi.mock('node:child_process', () => ({ execFile }));

const { checkUrl, curlArgs, liveStep, readOptions } = await import('../../edge/url-check');
type Hop = import('../../edge/url-check').Hop;

function fakeStep(answers: Record<string, Hop>) {
  return async (url: string) => answers[url] ?? { status: 404 };
}

const redirect = (location: string): Hop => ({ status: 301, location });

describe('checkUrl', () => {
  it('passes a URL that answers 200', async () => {
    const result = await checkUrl({ url: 'https://a.test/' }, fakeStep({ 'https://a.test/': { status: 200 } }));
    expect(result).toEqual({ ok: true, hops: ['200 https://a.test/'] });
  });

  it('passes two redirects that end in 200', async () => {
    const step = fakeStep({
      'http://a.test/old': redirect('https://a.test/old'),
      'https://a.test/old': redirect('https://a.test/new/'),
      'https://a.test/new/': { status: 200 },
    });
    expect(await checkUrl({ url: 'http://a.test/old' }, step)).toEqual({
      ok: true,
      hops: ['301 http://a.test/old', '301 https://a.test/old', '200 https://a.test/new/'],
    });
  });

  it('fails a third redirect', async () => {
    const step = fakeStep({
      'https://a.test/1': redirect('https://a.test/2'),
      'https://a.test/2': redirect('https://a.test/3'),
      'https://a.test/3': redirect('https://a.test/4'),
      'https://a.test/4': { status: 200 },
    });
    const result = await checkUrl({ url: 'https://a.test/1' }, step);
    expect(result.ok).toBe(false);
    expect(result.hops).toEqual(['301 https://a.test/1', '301 https://a.test/2', '301 https://a.test/3']);
  });

  it('passes a 410 only for an entry marked gone', async () => {
    const step = fakeStep({ 'https://a.test/xmlrpc.php': { status: 410 } });
    expect((await checkUrl({ url: 'https://a.test/xmlrpc.php', gone: true }, step)).ok).toBe(true);
    expect((await checkUrl({ url: 'https://a.test/xmlrpc.php' }, step)).ok).toBe(false);
  });

  it('fails a 404', async () => {
    expect(await checkUrl({ url: 'https://a.test/missing' }, fakeStep({}))).toEqual({ ok: false, hops: ['404 https://a.test/missing'] });
  });
});

describe('curlArgs', () => {
  it('asks curl for the status and redirect target of one request', () => {
    expect(curlArgs('https://a.test/')).toEqual(['-s', '-o', '/dev/null', '-w', '%{http_code} %{redirect_url}', '--max-redirs', '0', 'https://a.test/']);
  });

  it('connects every host to the given one when asked', () => {
    expect(curlArgs('https://a.test/', 'd111.cloudfront.net')).toEqual([
      '-s',
      '-o',
      '/dev/null',
      '-w',
      '%{http_code} %{redirect_url}',
      '--max-redirs',
      '0',
      '--connect-to',
      '::d111.cloudfront.net:',
      'https://a.test/',
    ]);
  });
});

describe('liveStep', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('waits 400 ms between two requests', async () => {
    vi.useFakeTimers();
    execFile.mockClear();
    const step = liveStep();
    const first = step('https://a.test/1');
    await vi.advanceTimersByTimeAsync(0);
    expect(execFile).toHaveBeenCalledTimes(1);
    const second = step('https://a.test/2');
    await vi.advanceTimersByTimeAsync(399);
    expect(execFile).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(execFile).toHaveBeenCalledTimes(2);
    expect(await first).toEqual({ status: 200 });
    expect(await second).toEqual({ status: 200 });
    expect(execFile.mock.calls[1].slice(0, 2)).toEqual(['curl', curlArgs('https://a.test/2')]);
  });
});

describe('readOptions', () => {
  it('reads a check against a local build', () => {
    expect(readOptions(['--inventory', 'i.json', '--dist', 'dist', '--function', 'f.js'])).toEqual({
      inventory: 'i.json',
      mode: { kind: 'local', dist: 'dist', functionFile: 'f.js' },
    });
  });

  it('reads a live check, with or without a host to connect to', () => {
    expect(readOptions(['--inventory', 'i.json', '--live'])).toEqual({ inventory: 'i.json', mode: { kind: 'live' } });
    expect(readOptions(['--inventory', 'i.json', '--live', '--connect-to', 'd111.cloudfront.net']).mode).toEqual({
      kind: 'live',
      connectTo: 'd111.cloudfront.net',
    });
  });

  for (const args of [
    ['--inventory', 'i.json'],
    ['--inventory', 'i.json', '--live', '--dist', 'dist'],
    ['--inventory', 'i.json', '--live', '--function', 'f.js'],
    ['--inventory', 'i.json', '--dist', 'dist'],
    ['--inventory', 'i.json', '--dist', 'dist', '--function', 'f.js', '--connect-to', 'd111.cloudfront.net'],
    ['--live'],
  ]) {
    it(`refuses ${args.join(' ')}`, () => {
      expect(() => readOptions(args)).toThrow(/^usage: /);
    });
  }
});
